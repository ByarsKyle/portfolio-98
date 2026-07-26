// ─────────────────────────────────────────────────────────────
// os/vaultcrypto — the vault's cryptography, ported verbatim from Personal OS
// (src/lib/vault/crypto.ts, generator.ts, totp.ts). TypeScript annotations are
// stripped; the algorithms, iteration counts, IV lengths and wire encoding are
// byte-for-byte the same, because the ciphertext in the Convex vault was
// written by the original and has to keep opening with this one.
//
// Nothing in here is portfolio theatre. This is the real thing.
// ─────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// Vault cryptography — runs ONLY in the browser.
//
// Design (mirrors consumer password managers like Bitwarden/1Password):
//
//   master password ─PBKDF2-SHA256(600k)─▶ wrapping key (KEK)
//   random 256-bit vault key (DEK) ─AES-GCM wrap w/ KEK─▶ wrappedKey (stored)
//   every item field / file ─AES-256-GCM w/ DEK─▶ ciphertext (stored)
//
// The server only ever holds: the KDF salt, the iteration count, the wrapped
// DEK, and item ciphertext. None of those reveal anything without the master
// password. The DEK lives only in memory while unlocked and is dropped on lock.
//
// Why this shape:
//   • Changing the master password only re-wraps the DEK — items never need
//     re-encryption.
//   • AES-GCM is authenticated: a wrong password fails the unwrap's auth tag,
//     which doubles as password verification (no separate verifier needed).
//   • Per-encryption random 96-bit IVs; never reused under a given key.
// ---------------------------------------------------------------------------

// OWASP 2023 floor for PBKDF2-HMAC-SHA256. Persisted per-account so it can be
// raised over time without breaking existing vaults.
export const DEFAULT_PBKDF2_ITERATIONS = 600_000;

const IV_BYTES = 12; // 96-bit GCM nonce
const SALT_BYTES = 16;
const KEY_BITS = 256;

const subtle = () => {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error(
      'Web Crypto is unavailable — the vault requires a secure (https) context.'
    );
  }
  return crypto.subtle;
};

/**
 * Non-throwing form of the check above, for UI that would rather explain the
 * problem than blow up inside a render loop. Web Crypto's subtle API only
 * exists in a secure context: https, or localhost. Plain http over a LAN
 * address has no crypto.subtle at all, and no amount of retrying will help.
 */
export function cryptoStatus() {
  if (typeof crypto !== 'undefined' && crypto.subtle) return { ok: true, message: null };
  const insecure = typeof window !== 'undefined' && window.isSecureContext === false;
  return {
    ok: false,
    message: insecure
      ? 'This page is not a secure context, so the browser will not provide Web Crypto. The vault needs https (or localhost) to decrypt anything.'
      : 'Web Crypto is unavailable in this browser, so the vault cannot decrypt anything.',
  };
}

// The original copies into a fresh ArrayBuffer-backed view to satisfy TS 5.7's
// BufferSource typing. Kept here on purpose: it also detaches subarray views
// (iv / ciphertext slices) from their parent buffer before they reach Web
// Crypto, which is exactly the byte range each call is meant to see.
function buf(b) {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

// ---- base64 <-> bytes -----------------------------------------------------

export function bytesToBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

// ---- key derivation / wrapping -------------------------------------------

/** Derive the wrapping key (KEK) from the master password + salt. */
async function deriveWrappingKey(password, salt, iterations) {
  const baseKey = await subtle().importKey(
    'raw',
    buf(new TextEncoder().encode(password)),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return subtle().deriveKey(
    { name: 'PBKDF2', salt: buf(salt), iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

/**
 * First-run: generate a fresh random vault key and wrap it under the master
 * password. Returns the params to persist plus the live (extractable) key.
 * The key is kept extractable in memory so the password can later be changed
 * (re-wrap) — it never leaves the browser.
 */
export async function createVaultKey(password, iterations = DEFAULT_PBKDF2_ITERATIONS) {
  const salt = randomBytes(SALT_BYTES);
  const kek = await deriveWrappingKey(password, salt, iterations);
  const key = await subtle().generateKey(
    { name: 'AES-GCM', length: KEY_BITS },
    true, // extractable so it can be wrapped
    ['encrypt', 'decrypt']
  );
  const wrappedKey = await wrapVaultKey(key, kek);
  return {
    params: {
      kdfSalt: bytesToBase64(salt),
      kdfIterations: iterations,
      wrappedKey,
    },
    key,
  };
}

async function wrapVaultKey(key, kek) {
  const iv = randomBytes(IV_BYTES);
  const wrapped = await subtle().wrapKey('raw', key, kek, {
    name: 'AES-GCM',
    iv: buf(iv),
  });
  return bytesToBase64(concat(iv, new Uint8Array(wrapped)));
}

/**
 * Unlock: re-derive the KEK and unwrap the stored vault key. Throws on a wrong
 * password (GCM auth-tag failure). The returned key is extractable to support
 * later password changes.
 */
export async function unlockVaultKey(password, params) {
  const salt = base64ToBytes(params.kdfSalt);
  const kek = await deriveWrappingKey(password, salt, params.kdfIterations);
  const raw = base64ToBytes(params.wrappedKey);
  const iv = raw.subarray(0, IV_BYTES);
  const wrapped = raw.subarray(IV_BYTES);
  try {
    return await subtle().unwrapKey(
      'raw',
      buf(wrapped),
      kek,
      { name: 'AES-GCM', iv: buf(iv) },
      { name: 'AES-GCM', length: KEY_BITS },
      true,
      ['encrypt', 'decrypt']
    );
  } catch {
    throw new WrongPasswordError();
  }
}

/** Re-wrap the existing vault key under a new master password. */
export async function rewrapVaultKey(key, newPassword, iterations = DEFAULT_PBKDF2_ITERATIONS) {
  const salt = randomBytes(SALT_BYTES);
  const kek = await deriveWrappingKey(newPassword, salt, iterations);
  const wrappedKey = await wrapVaultKey(key, kek);
  return { kdfSalt: bytesToBase64(salt), kdfIterations: iterations, wrappedKey };
}

// ---- session persistence ---------------------------------------------------
// Manual-lock model: the unlocked DEK survives reloads by living in
// sessionStorage (as base64 raw bytes) until the user explicitly locks. This
// trades pure in-memory secrecy for convenience on a personal device — the key
// still never leaves the browser, is dropped when the tab closes, and is
// removed on manual lock.
//
// PORT NOTE: the two functions below are carried over for completeness, but
// this build never calls them. In the 98 vault the DEK exists only as a
// module-local variable and dies with the window; nothing is ever written to
// sessionStorage, localStorage or the global object.

export async function exportVaultKey(key) {
  const raw = await subtle().exportKey('raw', key);
  return bytesToBase64(new Uint8Array(raw));
}

export async function importVaultKey(b64) {
  return subtle().importKey(
    'raw',
    buf(base64ToBytes(b64)),
    { name: 'AES-GCM', length: KEY_BITS },
    true, // stays extractable so a password change can re-wrap it
    ['encrypt', 'decrypt']
  );
}

export class WrongPasswordError extends Error {
  constructor() {
    super('Incorrect master password');
    this.name = 'WrongPasswordError';
  }
}

// ---- symmetric encryption (items + files) --------------------------------

/** Encrypt a UTF-8 string, returning base64(iv ‖ ciphertext‖tag). */
export async function encryptString(plaintext, key) {
  const iv = randomBytes(IV_BYTES);
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv: buf(iv) },
    key,
    buf(new TextEncoder().encode(plaintext))
  );
  return bytesToBase64(concat(iv, new Uint8Array(ct)));
}

export async function decryptString(payload, key) {
  const raw = base64ToBytes(payload);
  const iv = raw.subarray(0, IV_BYTES);
  const ct = raw.subarray(IV_BYTES);
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: buf(iv) }, key, buf(ct));
  return new TextDecoder().decode(pt);
}

/** Encrypt/parse a JSON-serializable value. */
export async function encryptJSON(value, key) {
  return encryptString(JSON.stringify(value), key);
}

export async function decryptJSON(payload, key) {
  return JSON.parse(await decryptString(payload, key));
}

/** Encrypt raw bytes (files/photos) → new blob bytes (iv ‖ ciphertext). */
export async function encryptBytes(data, key) {
  const iv = randomBytes(IV_BYTES);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv: buf(iv) }, key, data);
  return concat(iv, new Uint8Array(ct));
}

export async function decryptBytes(blob, key) {
  const raw = new Uint8Array(blob);
  const iv = raw.subarray(0, IV_BYTES);
  const ct = raw.subarray(IV_BYTES);
  return subtle().decrypt({ name: 'AES-GCM', iv: buf(iv) }, key, buf(ct));
}

function concat(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// generator.ts
// ═══════════════════════════════════════════════════════════════════════════

// Cryptographically-secure password + passphrase generation, plus a lightweight
// strength estimator. All randomness comes from crypto.getRandomValues with
// rejection sampling to avoid modulo bias.

export const DEFAULT_PASSWORD_OPTIONS = {
  length: 20,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
  avoidAmbiguous: true,
};

const SETS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?',
};
const AMBIGUOUS = new Set('O0oIl1|`\'"{}[]()/\\'.split(''));

/** Uniform random integer in [0, max) without modulo bias. */
function randomInt(max) {
  if (max <= 0) return 0;
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  let x = 0;
  do {
    crypto.getRandomValues(buffer);
    x = buffer[0];
  } while (x >= limit);
  return x % max;
}

function pick(arr) {
  return arr[randomInt(arr.length)];
}

/** Fisher–Yates shuffle using secure randomness. */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generatePassword(opts) {
  const pools = [];
  ['uppercase', 'lowercase', 'numbers', 'symbols'].forEach((k) => {
    if (opts[k]) {
      let chars = SETS[k].split('');
      if (opts.avoidAmbiguous) chars = chars.filter((c) => !AMBIGUOUS.has(c));
      if (chars.length) pools.push(chars.join(''));
    }
  });
  if (pools.length === 0) pools.push(SETS.lowercase);

  const length = Math.max(opts.length, pools.length);
  const out = [];
  // Guarantee at least one char from each selected pool.
  for (const pool of pools) out.push(pick(pool.split('')));
  const all = pools.join('').split('');
  while (out.length < length) out.push(pick(all));
  return shuffle(out).join('');
}

// EFF-style short list — a curated 256-word set (8 bits of entropy per word).
const WORDS =
  'able acid aged also apex aqua arch arid army atom aunt aura auto away axis baby back bake bald band bank bare barn base bash bath bead beam bean bear beat beef bell belt bend best bike bill bird bite blue boat body bold bolt bone book boom boot born boss both bowl brew brow bulk bull burn bush busy cafe cage cake calm camp cane card care cart case cash cave cell chef chin chip chop city clam clap claw clay clip club coal coat code coil coin cold colt cook cool cope copy cord core corn cost cove crab crew crop cube cusp dart dash data date dawn deal dean debt deck deed deep deer desk dial dice diet dime dine disk dive dock doll dome door dose dove down draw drum dual duck dune dusk dust duty each earn ease east easy echo edge exit face fact fade fair fall fame farm fast fate fawn fern feud file film find fine fire firm fish five flag flat flaw flax fled flew flex flip flow foam fold folk font food foot fork form fort four free frog fuel fund gain game gate gaze gear gene gift gill girl give glad glen glow goat goal gold golf gone good gown grab gray grew grid grim grin grip grow gulf gull gust hail hair half hall halt hand hang hard hare hark harm hawk haze head heal heap hear heat heir herb herd here hero hide high hill hint hive hold hole holy home hood hoof hook hope horn host hour huge hull hunt hush icon idea inch iris iron isle item jade jail jazz join joke jolt july jump june junk jury kale keen keep kelp kept kick kind king kiss kite knee knew knit knot know lace lady lake lamb lamp land lane last late lawn lead leaf leak lean leap left lend lens levy lids life lift like lily limb lime line link lion list live load loaf loan lock loft logo lone long look loop lord lose loss lost loud love luck lump lung lush lynx maid mail main make male mall malt maple mars mash mask mast math maze meal mean meat memo menu mesh mess mild mile milk mill mind mine mint mist moat mode mold mole monk mood moon moss most moth move much mule muse mush must mute myth nail name navy near neat neck need neon nest news next nice node none noon nose note noun nova numb oak oath obey odd oint okay omen once only onto opal open oral oval oven owl pace pack pact page paid pail pain pair pale palm pane park part past path pave peak pear peel peer pest pick pier pike pile pill pine pink pint pipe plan play plot plow plug plum plus poem poet pole poll pond pony pool poor pope pork port pose post pour pray prep prey prom prop pull pulp pump pure push quiz race rack raft rage raid rail rain rake ramp rank rapt rare rash rate raw read real reap rear reed reef reel rely rest rice rich ride rift ring rink riot ripe rise risk road roam roar robe rock rode role roll roof room root rope rose rosy ruby rudy ruff rule rune runt rush rust sack safe saga sage sail salt same sand save scan scar seal seam seat seed seek seem seen self sell sent ship shoe shop shot show shut sick side sign silk sill silo sing sink site size skew skid skin skip slab slam slap sled slid slim slip slot slow slug snap snow soak soap soar sock soda sofa soft soil sold sole solo song sort soul soup sour span spin spot spun spur star stay stem step stir stop stow swan swap sway swim tack tail tale talk tall tame tank tape tart task team teal tear teen tent term test text than thaw that then thin this thud thug tick tide tidy tile till tilt time tiny toad toe toil told toll tomb tone tool toot torn tour town toy trap tray tree trek trim trio trip trot true tsar tube tuck tuna tune turf turn tusk twig twin type unit upon urge used user vain vale vast veal veil vein vend vent verb very vest veto vial vibe view vine visa vise void volt vote wade wage wait wake walk wall wand want ward warm warn warp wart wary wash wasp watt wave wavy waxy weak wear weed week weld well went were west what when whim whip whom wick wide wife wild will wind wine wing wink wipe wire wise wish wolf wood wool word wore work worm worn wrap wren yard yarn yawn yeah year yell yoga yolk zeal zero zest zinc zone zoom'.split(
    ' '
  );

export function generatePassphrase(words = 5, separator = '-', capitalize = true, includeNumber = true) {
  const parts = [];
  for (let i = 0; i < words; i++) {
    let w = pick(WORDS);
    if (capitalize) w = w[0].toUpperCase() + w.slice(1);
    parts.push(w);
  }
  let out = parts.join(separator);
  if (includeNumber) out += separator + randomInt(90) + 10;
  return out;
}

// ---- strength estimation --------------------------------------------------

const LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];

/**
 * Estimate strength from character-class entropy, discounted for obvious
 * patterns (repeats, sequences, tiny length). Not a full zxcvbn, but honest
 * enough to steer the user toward stronger secrets.
 */
export function estimateStrength(pw) {
  if (!pw) return { score: 0, label: LABELS[0], bits: 0 };

  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += 32;
  pool = Math.max(pool, 1);

  let bits = pw.length * Math.log2(pool);

  // Penalties for low-entropy structure.
  const unique = new Set(pw).size;
  if (unique / pw.length < 0.5) bits *= 0.6; // heavy repetition
  if (/(.)\1{2,}/.test(pw)) bits *= 0.8; // runs like "aaa"
  if (/(0123|1234|2345|abcd|qwer|asdf|password|admin)/i.test(pw)) bits *= 0.5;

  const score = bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 90 ? 3 : 4;
  return { score, label: LABELS[score], bits: Math.round(bits) };
}

// ═══════════════════════════════════════════════════════════════════════════
// totp.ts
// ═══════════════════════════════════════════════════════════════════════════

// RFC 6238 TOTP generation in the browser via Web Crypto (HMAC-SHA1).
// Accepts either a raw base32 secret or a full otpauth:// URI.

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input) {
  const clean = input.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) continue; // skip stray chars
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

/** Parse a stored TOTP string (otpauth URI or bare secret) into a config. */
export function parseTotp(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase().startsWith('otpauth://')) {
    try {
      const url = new URL(trimmed);
      const secret = url.searchParams.get('secret');
      if (!secret) return null;
      const algParam = (url.searchParams.get('algorithm') ?? 'SHA1').toUpperCase();
      const algorithm =
        algParam === 'SHA256'
          ? 'SHA-256'
          : algParam === 'SHA512'
            ? 'SHA-512'
            : 'SHA-1';
      return {
        secret,
        digits: Number(url.searchParams.get('digits')) || 6,
        period: Number(url.searchParams.get('period')) || 30,
        algorithm,
      };
    } catch {
      return null;
    }
  }
  // Bare base32 secret with sane defaults.
  const secret = trimmed.replace(/\s/g, '');
  if (!/^[A-Za-z2-7]+=*$/.test(secret)) return null;
  return { secret, digits: 6, period: 30, algorithm: 'SHA-1' };
}

/** Generate the current 6–8 digit code plus seconds remaining in the window. */
export async function generateTotp(config, now = Date.now()) {
  const key = base32Decode(config.secret);
  if (key.length === 0) return null;

  const counter = Math.floor(now / 1000 / config.period);
  const msg = new Uint8Array(8);
  // 64-bit big-endian counter (only low 48 bits matter in practice).
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256);
  }

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key.slice(),
    { name: 'HMAC', hash: config.algorithm },
    false,
    ['sign']
  );
  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, msg.slice()));

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const code = (binary % 10 ** config.digits).toString().padStart(config.digits, '0');

  const secondsRemaining = config.period - Math.floor((now / 1000) % config.period);
  return { code, secondsRemaining };
}
