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
  status: 'offline',     // offline | connecting | signed-out | signing-in | online | error
  user: null,            // { email, name } once signed in
  error: null,
  clerk: null,
  convex: null,
  fnRef: null,           // makeFunctionReference, once convex is loaded
  loading: null,         // in-flight init promise
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
    setStatus('signed-out');
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
/**
 * Password sign-in, driven entirely from the Win98 dialog — no Clerk chrome.
 * If the instance wants something we can't collect from a canvas (an emailed
 * code, a second factor), we say so and hand off to Clerk's own modal rather
 * than pretending to support it.
 *
 * @returns {Promise<{ok: boolean, needsHostedUI?: boolean, message?: string}>}
 */
export async function signIn(email, password) {
  await connect();
  const clerk = state.clerk;
  if (!clerk) return { ok: false, message: state.error ?? 'Not connected.' };

  setStatus('signing-in');
  try {
    const attempt = await clerk.client.signIn.create({
      identifier: String(email).trim(),
      password,
    });

    if (attempt.status !== 'complete') {
      setStatus('signed-out');
      return {
        ok: false,
        needsHostedUI: true,
        message: `This account needs another step (${attempt.status.replace(/_/g, ' ')}).`,
      };
    }

    await clerk.setActive({ session: attempt.createdSessionId });
    await syncUser();
    return { ok: state.status === 'online', message: state.error ?? undefined };
  } catch (err) {
    const message = describe(err);
    // strategy not enabled on this instance → the modal can still do it
    const needsHostedUI = /strategy|not allowed|identifier/i.test(message);
    setStatus('signed-out', { error: message });
    return { ok: false, needsHostedUI, message };
  }
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
  signIn, signOut, openHostedSignIn,
  query, watch, mutation,
};

export default backend;
