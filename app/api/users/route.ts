import { randomUUID } from "crypto";
import { body, fail, messageOf, ok } from "@/lib/api";
import { mutate, readStore } from "@/lib/store";
import { currentUser, hashPassword, MIN_PASSWORD, normEmail, publicUser, verifyPassword } from "@/lib/users";

export const dynamic = "force-dynamic";

/** Everyone signed in can see who has access. */
export async function GET() {
  const me = await currentUser();
  if (!me) return fail("Sign in first.", 401);
  const { users = [] } = await readStore();
  return ok({ me: publicUser(me), users: users.map(publicUser) });
}

/** Add a person (admins only). */
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return fail("Sign in first.", 401);
  if (!me.admin) return fail("Only an admin can add people.", 403);
  const b = await body<{ name?: string; email?: string; password?: string; admin?: boolean }>(req);
  const email = normEmail(b?.email ?? "");
  const name = (b?.name ?? "").trim();
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Enter a name and a valid email.");
  if ((b?.password ?? "").length < MIN_PASSWORD) return fail(`The password needs at least ${MIN_PASSWORD} characters.`);
  const passwordHash = await hashPassword(b!.password!);
  try {
    const added = await mutate((d) => {
      d.users ??= [];
      if (d.users.some((u) => u.email === email)) return null;
      const u = { id: randomUUID(), email, name, passwordHash, admin: !!b?.admin, createdAt: new Date().toISOString() };
      d.users.push(u);
      return u;
    });
    return added ? ok(publicUser(added)) : fail("Someone already uses that email.", 409);
  } catch (e) {
    return fail(messageOf(e), 500);
  }
}

/**
 * Change a password: your own (with your current password), or anyone's as an admin.
 * Also lets an admin make someone an admin or not.
 */
export async function PATCH(req: Request) {
  const me = await currentUser();
  if (!me) return fail("Sign in first.", 401);
  const b = await body<{ id?: string; current?: string; password?: string; admin?: boolean }>(req);
  const id = b?.id ?? me.id;
  const self = id === me.id;
  if (!self && !me.admin) return fail("Only an admin can change someone else.", 403);
  if (b?.password !== undefined) {
    if (b.password.length < MIN_PASSWORD) return fail(`The password needs at least ${MIN_PASSWORD} characters.`);
    if (self && !(await verifyPassword(me, b.current ?? ""))) return fail("Your current password isn't right.", 403);
  }
  const passwordHash = b?.password !== undefined ? await hashPassword(b.password) : null;
  try {
    const result = await mutate((d) => {
      const u = d.users?.find((x) => x.id === id);
      if (!u) return "missing" as const;
      if (b?.admin !== undefined && !self) {
        if (!b.admin && u.admin && d.users!.filter((x) => x.admin).length === 1) return "last" as const;
        u.admin = b.admin;
      }
      if (passwordHash) u.passwordHash = passwordHash;
      return publicUser(u);
    });
    if (result === "missing") return fail("That person no longer has access.", 404);
    if (result === "last") return fail("Keep at least one admin.", 409);
    return ok(result);
  } catch (e) {
    return fail(messageOf(e), 500);
  }
}

/** Remove a person (admins only; not yourself, not the last admin). */
export async function DELETE(req: Request) {
  const me = await currentUser();
  if (!me) return fail("Sign in first.", 401);
  if (!me.admin) return fail("Only an admin can remove people.", 403);
  const id = new URL(req.url).searchParams.get("id");
  if (!id || id === me.id) return fail("You can't remove yourself.");
  try {
    const result = await mutate((d) => {
      const u = d.users?.find((x) => x.id === id);
      if (!u) return "missing" as const;
      if (u.admin && d.users!.filter((x) => x.admin).length === 1) return "last" as const;
      d.users = d.users!.filter((x) => x.id !== id);
      return "ok" as const;
    });
    if (result === "missing") return fail("That person no longer has access.", 404);
    if (result === "last") return fail("Keep at least one admin.", 409);
    return ok();
  } catch (e) {
    return fail(messageOf(e), 500);
  }
}
