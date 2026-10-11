import { NextResponse } from "next/server";
import { body, fail, messageOf } from "@/lib/api";
import { authConfigured, makeSessionToken, SESSION_COOKIE, SESSION_DAYS } from "@/lib/session";
import { signIn, stampOf } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!authConfigured()) return fail("Sign-in isn't set up: AUTH_SECRET is missing. See DEPLOY.md.", 500);
  const b = await body<{ email?: string; password?: string }>(req);
  if (!b?.email || !b.password) return fail("Enter your email and password.");
  try {
    const user = await signIn(b.email, b.password);
    if (!user) {
      // Slow down guessing.
      await new Promise((r) => setTimeout(r, 800));
      return fail("That email and password don't match.", 401);
    }
    const res = NextResponse.json({ ok: true, name: user.name });
    res.cookies.set(SESSION_COOKIE, await makeSessionToken(user.id, stampOf(user)), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DAYS * 86_400,
    });
    return res;
  } catch (e) {
    return fail(messageOf(e), 500);
  }
}
