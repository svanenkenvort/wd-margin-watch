import { NextResponse, type NextRequest } from "next/server";
import { readSessionToken, SESSION_COOKIE } from "./lib/session";

/**
 * Everything needs a valid sign-in cookie except the sign-in page itself. Pages send you to sign
 * in; API calls answer 401. (Pages and API routes also check the user still exists, in lib/users.)
 */
export async function middleware(req: NextRequest) {
  if (await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = req.nextUrl.pathname === "/" ? "" : `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/auth/|_next/static|_next/image|favicon.ico|icon|robots.txt).*)"],
};
