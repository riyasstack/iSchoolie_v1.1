/**
 * Opaque session token signing, usable in both the Node runtime and the proxy.
 * Cookie value: "<token>.<hmac>" where token is 32 random bytes (base64url).
 */
export const SESSION_COOKIE = "isc_session";

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

export async function signToken(token: string, secret: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(token));
  return `${token}.${b64url(sig)}`;
}

/** Returns the token when the signature is valid, otherwise null. Constant-time compare. */
export async function verifyCookie(value: string | undefined, secret: string): Promise<string | null> {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const token = value.slice(0, dot);
  const expected = await signToken(token, secret);
  if (expected.length !== value.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ value.charCodeAt(i);
  return diff === 0 ? token : null;
}

export function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}

export async function hashToken(token: string): Promise<string> {
  return b64url(await crypto.subtle.digest("SHA-256", enc.encode(token)));
}
