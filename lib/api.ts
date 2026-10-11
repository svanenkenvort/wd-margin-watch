import { NextResponse } from "next/server";
import { currentUser } from "./users";

export const ok = (body: unknown = { ok: true }) => NextResponse.json(body);
export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function body<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

/** For API routes: a 401 answer if nobody (valid) is signed in, otherwise null. */
export async function signedOut(): Promise<Response | null> {
  return (await currentUser()) ? null : fail("Sign in first.", 401);
}
