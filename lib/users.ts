import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { mutate, readStore } from "./store";
import { readSessionToken, SESSION_COOKIE } from "./session";
import type { User } from "./types";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const MIN_PASSWORD = 10;

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

async function checkPassword(pw: string, stored: string): Promise<boolean> {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const want = Buffer.from(hash, "base64");
  const got = await scrypt(pw, Buffer.from(salt, "base64"), want.length);
  return timingSafeEqual(got, want);
}

/** Part of the password hash: changes when the password does, which ends other sign-ins. */
export const stampOf = (u: User) => u.passwordHash.slice(-12);

export const normEmail = (e: string) => e.trim().toLowerCase();

/** A user as the screen may see it (never the password hash). */
export const publicUser = (u: User) => ({ id: u.id, email: u.email, name: u.name, admin: u.admin, createdAt: u.createdAt });
export type PublicUser = ReturnType<typeof publicUser>;

/**
 * Checks an email and password. While nobody has an account yet, ADMIN_EMAIL and ADMIN_PASSWORD
 * (environment variables) sign in and create the first admin.
 */
export async function signIn(email: string, password: string): Promise<User | null> {
  const e = normEmail(email);
  const { users = [] } = await readStore();
  if (!users.length) {
    const ae = normEmail(process.env.ADMIN_EMAIL ?? "");
    const ap = process.env.ADMIN_PASSWORD ?? "";
    if (!ae || ap.length < MIN_PASSWORD || e !== ae || password !== ap) return null;
    const passwordHash = await hashPassword(password);
    const local = ae.split("@")[0];
    const name = process.env.ADMIN_NAME?.trim() || local.charAt(0).toUpperCase() + local.slice(1);
    return mutate((d) => {
      d.users ??= [];
      if (!d.users.length) d.users.push({ id: randomUUID(), email: ae, name, passwordHash, admin: true, createdAt: new Date().toISOString() });
      return d.users.find((u) => u.email === ae) ?? null;
    });
  }
  const user = users.find((u) => u.email === e);
  return user && (await checkPassword(password, user.passwordHash)) ? user : null;
}

export async function verifyPassword(user: User, pw: string) {
  return checkPassword(pw, user.passwordHash);
}

/** The signed-in user, or null (signed out, removed, or password changed since). */
export async function currentUser(): Promise<User | null> {
  const session = await readSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const { users = [] } = await readStore();
  const user = users.find((u) => u.id === session.uid);
  return user && stampOf(user) === session.stamp ? user : null;
}

/** For pages: the signed-in user, or off to the sign-in screen. */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
