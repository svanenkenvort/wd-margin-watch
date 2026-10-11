import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { Logo } from "@/components/Shell";
import { authConfigured } from "@/lib/session";
import { readStore } from "@/lib/store";
import { currentUser } from "@/lib/users";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · Margin Watch" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await currentUser()) redirect("/");
  const { next } = await searchParams;
  const { users = [] } = await readStore();
  const setup = !authConfigured()
    ? "Sign-in isn't set up yet: AUTH_SECRET is missing. See DEPLOY.md."
    : !users.length && !(process.env.ADMIN_EMAIL && (process.env.ADMIN_PASSWORD ?? "").length >= 10)
      ? "No one has an account yet. Set ADMIN_EMAIL and ADMIN_PASSWORD (10+ characters) to create the first admin. See DEPLOY.md."
      : null;
  return (
    <main className="login">
      <div className="login-card">
        <div className="brand"><Logo /> <span>Margin Watch</span></div>
        <h1>Sign in</h1>
        {setup ? <p className="alert">{setup}</p> : <LoginForm next={next?.startsWith("/") && !next.startsWith("//") ? next : "/"} firstRun={!users.length} />}
      </div>
    </main>
  );
}
