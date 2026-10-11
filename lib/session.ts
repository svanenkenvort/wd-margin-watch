/**
 * Signed sign-in cookie. Uses Web Crypto only, so the same code runs in middleware (Edge) and in
 * the API routes (Node). The cookie holds the user id, a stamp that changes with their password,
 * and an expiry, signed with AUTH_SECRET; it can't be forged or edited without that secret.
 */
export const SESSION_COOKIE = "mw_session";
export const SESSION_DAYS = 30;

function secret(): string {
  const s = process.env.AUTH_SECRET ?? "";
  if (s.length >= 32) return s;
  // Local development only; production refuses to sign anyone in without a real secret.
  return process.env.NODE_ENV === "production" ? "" : "local-development-secret-not-for-production-use";
}

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload))));
}

export interface Session {
  uid: string;
  /** Changes when the password changes, which signs out other sessions. */
  stamp: string;
  exp: number;
}

export const authConfigured = () => secret() !== "";

export async function makeSessionToken(uid: string, stamp: string): Promise<string> {
  if (!authConfigured()) throw new Error("AUTH_SECRET is not set (it needs at least 32 characters). Add it to the environment variables and redeploy.");
  const payload = b64url(enc.encode(JSON.stringify({ uid, stamp, exp: Date.now() + SESSION_DAYS * 86_400_000 } satisfies Session)));
  return `${payload}.${await sign(payload)}`;
}

export async function readSessionToken(token: string | undefined): Promise<Session | null> {
  if (!token || !authConfigured()) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = await sign(payload);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff) return null;
  try {
    const s = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as Session;
    return s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}
