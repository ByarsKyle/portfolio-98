// ─────────────────────────────────────────────────────────────
// net/backend — the wire out of 1998.
//
// Mail and the password vault are not simulations: they talk to the same
// Convex deployment and the same Clerk instance that back Personal OS. This
// module is the only thing in the project that knows that, and it is the only
// thing that ever touches the network for them.
//
// Everything here is lazy. Clerk and the Convex client are several hundred
// kilobytes between them and the room has no use for either, so they are
// dynamically imported the first time an app actually asks to connect. Until
// then this file costs a few hundred bytes.
//
// Access is decided server-side: convex/users.ts holds a hard-coded address
// allowlist, so a stranger who finds the sign-in window and has a Clerk account
// still gets nothing back. Every query in this app is auth-tolerant and returns
// an empty result rather than throwing when there is no session.
// ─────────────────────────────────────────────────────────────

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL ?? '';
const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? '';

/** Clerk's JWT template for this Convex deployment (convex/auth.config.ts). */
const JWT_TEMPLATE = 'convex';

const state = {
  status: 'offline',     // offline | connecting | signed-out | signing-in
                         // | needs-code | online | error
  user: null,            // { email, name } once signed in
  error: null,
  clerk: null,
  convex: null,
  fnRef: null,           // makeFunctionReference, once convex is loaded
  loading: null,         // in-flight init promise
  flow: null,            // half-finished sign-in awaiting a verification code
};

const listeners = new Set();
const emit = () => { for (const fn of listeners) fn(snapshot()); };

const snapshot = () => ({
  status: state.status,
  user: state.user,
  error: state.error,
  configured: isConfigured(),
});

export function isConfigured() {
  return Boolean(CONVEX_URL && CLERK_KEY);
}

export function onChange(fn) {
  listeners.add(fn);
  fn(snapshot());
  return () => listeners.delete(fn);
}

export function getStatus() { return snapshot(); }

function setStatus(status, { error = null } = {}) {
  state.status = status;
  state.error = error;
  emit();
}

// ── connection ─────────────────────────────────────────────────
/**
 * Load Clerk + Convex and restore any existing session. Safe to call from
 * every app on every open; the work happens once.
 */
export function connect() {
  if (state.loading) return state.loading;
  if (!isConfigured()) {
    setStatus('error', { error: 'No backend configured. Set VITE_CONVEX_URL and VITE_CLERK_PUBLISHABLE_KEY.' });
    return Promise.resolve(snapshot());
  }

  setStatus('connecting');
  state.loading = (async () => {
    const [{ Clerk }, { ConvexClient }, { makeFunctionReference }] = await Promise.all([
      import('@clerk/clerk-js'),
      import('convex/browser'),
      import('convex/server'),
    ]);

    state.fnRef = makeFunctionReference;

    const clerk = new Clerk(CLERK_KEY);
    await clerk.load({});
    state.clerk = clerk;

    const convex = new ConvexClient(CONVEX_URL);
    // Convex asks for a fresh token whenever its own is close to expiring;
    // skipCache on forceRefreshToken is what makes rotation work.
    convex.setAuth(async ({ forceRefreshToken } = {}) => {
      const session = state.clerk?.session;
      if (!session) return null;
      try {
        return await session.getToken({ template: JWT_TEMPLATE, skipCache: forceRefreshToken });
      } catch {
        return null;
      }
    });
    state.convex = convex;

    clerk.addListener(() => { syncUser().catch(() => {}); });
    await syncUser();
    return snapshot();
  })().catch((err) => {
    state.loading = null;
    setStatus('error', { error: describe(err) });
    return snapshot();
  });

  return state.loading;
}

/**
 * Reconcile Clerk's session with our own status. A valid Clerk token is not
 * enough on its own — every Convex function resolves the caller through a
 * `users` row, and that row only exists once users:ensure has run. Until then
 * queries quietly return empty and mutations throw "Not authenticated", which
 * looks exactly like a broken app. So ensure runs on every session start; it
 * is idempotent, and it is also where the address allowlist is enforced.
 */
async function syncUser() {
  const clerk = state.clerk;
  if (!clerk?.session) {
    state.user = null;
    // Clerk fires its listener while a sign-in is half finished; don't let that
    // knock the dialog back to the password box mid-verification.
    if (!state.flow) setStatus('signed-out');
    return;
  }
  try {
    await state.convex.mutation(state.fnRef('users:ensure'), {});
  } catch (err) {
    // allowlist rejection, or a token that Convex would not accept
    state.user = null;
    await clerk.signOut().catch(() => {});
    setStatus('error', { error: describe(err) });
    return;
  }
  const u = clerk.user;
  state.user = {
    email: u?.primaryEmailAddress?.emailAddress ?? '',
    name: u?.fullName || u?.firstName || '',
  };
  setStatus('online');
}

// ── sign in / out ──────────────────────────────────────────────
// Signing in is a state machine, not a single call. Password is only ever the
// first step: Clerk can come back asking for a second factor, or — the one that
// actually bit us — `needs_client_trust`, its device-verification step, which
// fires the first time a given browser is used and mails you a code. Both route
// through the same second-factor machinery, so the dialog handles them the same
// way instead of giving up and pointing at Clerk's own UI.

/** Strategies that mean "we sent you something"; the rest you already have. */
const SENT_TO_YOU = new Set(['email_code', 'phone_code']);

/** Most convenient first. totp/backup_code need no prepare step. */
const FACTOR_ORDER = ['email_code', 'phone_code', 'totp', 'backup_code'];

const pickFactor = (factors) => {
  const list = Array.isArray(factors) ? factors : [];
  for (const strategy of FACTOR_ORDER) {
    const hit = list.find((f) => f?.strategy === strategy);
    if (hit) return hit;
  }
  return null;
};

const describeFactor = (factor) => ({
  strategy: factor.strategy,
  sent: SENT_TO_YOU.has(factor.strategy),
  // Clerk masks these for us — k•••@outlook.com, +1 ••• ••• 1234
  hint: factor.safeIdentifier ?? '',
  label: {
    email_code: 'e-mail',
    phone_code: 'text message',
    totp: 'authenticator app',
    backup_code: 'backup code',
  }[factor.strategy] ?? factor.strategy.replace(/_/g, ' '),
});

/** Hand off to Clerk's own modal, which can do anything we can't. */
const bail = (message) => {
  state.flow = null;
  setStatus('signed-out', { error: message });
  return { ok: false, needsHostedUI: true, message };
};

/**
 * Look at where Clerk has got to and either finish, ask for a code, or give up.
 * Every path through sign-in funnels through here.
 */
async function advance(res) {
  switch (res.status) {
    case 'complete':
      state.flow = null;
      await state.clerk.setActive({ session: res.createdSessionId });
      await syncUser();
      return state.status === 'online'
        ? { ok: true }
        : { ok: false, message: state.error ?? 'Signed in, but the server would not accept the account.' };

    case 'needs_first_factor':
      return askForCode(res, 'first');

    // needs_client_trust is Clerk verifying an unrecognised device. It is not a
    // second factor on the account, but it arrives through the same endpoints.
    case 'needs_second_factor':
    case 'needs_client_trust':
      return askForCode(res, 'second');

    case 'needs_new_password':
      return bail('This account has to set a new password before it can sign in.');

    default:
      return bail(`Clerk asked for "${String(res.status).replace(/_/g, ' ')}", which this dialog cannot do.`);
  }
}

async function askForCode(res, stage) {
  const factor = pickFactor(stage === 'second' ? res.supportedSecondFactors : res.supportedFirstFactors);
  if (!factor) return bail('This account needs a verification method this dialog cannot show.');

  try {
    if (SENT_TO_YOU.has(factor.strategy)) await sendCode(res, stage, factor);
  } catch (err) {
    return bail(describe(err));
  }

  state.flow = { res, stage, factor };
  setStatus('needs-code');
  return { ok: false, verify: describeFactor(factor) };
}

function sendCode(res, stage, factor) {
  const body = { strategy: factor.strategy };
  if (factor.emailAddressId) body.emailAddressId = factor.emailAddressId;
  if (factor.phoneNumberId) body.phoneNumberId = factor.phoneNumberId;
  return stage === 'second' ? res.prepareSecondFactor(body) : res.prepareFirstFactor(body);
}

/**
 * Step one: identifier + password.
 * @returns {Promise<{ok: boolean, verify?: object, needsHostedUI?: boolean, message?: string}>}
 */
export async function signIn(email, password) {
  await connect();
  const clerk = state.clerk;
  if (!clerk) return { ok: false, message: state.error ?? 'Not connected.' };

  state.flow = null;
  setStatus('signing-in');
  try {
    const attempt = await clerk.client.signIn.create({
      identifier: String(email).trim(),
      password,
    });
    return await advance(attempt);
  } catch (err) {
    const message = describe(err);
    // strategy not enabled on this instance → the modal can still do it
    const needsHostedUI = /strategy|not allowed|identifier/i.test(message);
    setStatus('signed-out', { error: message });
    return { ok: false, needsHostedUI, message };
  }
}

/** Step two: whatever Clerk asked for in `verify`. */
export async function submitCode(code) {
  const flow = state.flow;
  if (!flow) return { ok: false, message: 'That sign-in expired. Start again.' };

  const trimmed = String(code ?? '').trim();
  if (!trimmed) {
    return { ok: false, verify: describeFactor(flow.factor), message: 'Enter the code.' };
  }

  setStatus('signing-in');
  try {
    const body = { strategy: flow.factor.strategy, code: trimmed };
    const next = flow.stage === 'second'
      ? await flow.res.attemptSecondFactor(body)
      : await flow.res.attemptFirstFactor(body);
    return await advance(next);
  } catch (err) {
    const message = describe(err);
    // a wrong code is not the end of the flow — stay on this step
    state.flow = flow;
    setStatus('needs-code', { error: message });
    return { ok: false, verify: describeFactor(flow.factor), message };
  }
}

/** Send another one. Only meaningful for the mailed/texted strategies. */
export async function resendCode() {
  const flow = state.flow;
  if (!flow) return { ok: false, message: 'That sign-in expired. Start again.' };
  if (!SENT_TO_YOU.has(flow.factor.strategy)) {
    return { ok: false, message: 'That code comes from your authenticator, not from us.' };
  }
  try {
    await sendCode(flow.res, flow.stage, flow.factor);
    return { ok: true, message: 'Another code is on its way.' };
  } catch (err) {
    return { ok: false, message: describe(err) };
  }
}

/** Abandon a half-finished sign-in and go back to the password box. */
export function cancelSignIn() {
  state.flow = null;
  setStatus('signed-out');
}

/** Clerk's own sign-in modal. The escape hatch for MFA, OAuth and email codes. */
export async function openHostedSignIn() {
  await connect();
  state.clerk?.openSignIn({ afterSignInUrl: location.href });
}

export async function signOut() {
  if (!state.clerk) return;
  await state.clerk.signOut().catch(() => {});
  state.user = null;
  setStatus('signed-out');
}

// ── data ───────────────────────────────────────────────────────
const ref = (name) => {
  if (!state.fnRef) throw new Error('Backend not connected');
  return state.fnRef(name);
};

/** One-shot read. Resolves to `fallback` if we are not connected. */
export async function query(name, args = {}, fallback = null) {
  await connect();
  if (!state.convex) return fallback;
  try {
    return await state.convex.query(ref(name), args);
  } catch {
    return fallback;
  }
}

/**
 * Live read. `cb(value, error)` fires immediately with whatever Convex has and
 * again on every server-side change. Returns an unsubscribe function.
 */
export function watch(name, args, cb) {
  let stop = null;
  let dead = false;
  connect().then(() => {
    if (dead || !state.convex) return;
    try {
      stop = state.convex.onUpdate(ref(name), args, (value) => cb(value, null),
        (err) => cb(undefined, describe(err)));
    } catch (err) {
      cb(undefined, describe(err));
    }
  });
  return () => {
    dead = true;
    stop?.();
  };
}

/** Write. Throws — mutations are the one place we let the error through. */
export async function mutation(name, args = {}) {
  await connect();
  if (!state.convex) throw new Error(state.error ?? 'Not connected');
  try {
    return await state.convex.mutation(ref(name), args);
  } catch (err) {
    throw new Error(describe(err));
  }
}

// ── plumbing ───────────────────────────────────────────────────
/** Convex wraps server errors; dig out something a person can read. */
function describe(err) {
  const raw = err?.data ?? err?.message ?? String(err);
  const text = typeof raw === 'string' ? raw : (raw?.message ?? JSON.stringify(raw));
  // strip the "[Request ID: ...] Server Error\n  Uncaught Error: " preamble
  const m = /Uncaught Error:\s*([^\n]+)/.exec(text);
  return (m ? m[1] : text).replace(/\s*at handler[\s\S]*$/, '').trim() || 'Something went wrong.';
}

export const backend = {
  isConfigured, connect, onChange, getStatus,
  signIn, submitCode, resendCode, cancelSignIn, signOut, openHostedSignIn,
  query, watch, mutation,
};

export default backend;
