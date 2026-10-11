"use client";

import { useState } from "react";

export function LoginForm({ next, firstRun }: { next: string; firstRun: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
          if (res.ok) {
            window.location.assign(next);
            return;
          }
          setError((await res.json().catch(() => ({}))).error ?? "That didn't work. Try again.");
        } catch {
          setError("Couldn't reach the app. Check your connection.");
        }
        setBusy(false);
      }}
    >
      {firstRun && <p className="hint">First sign-in: use the admin email and password set in the environment variables. You can add everyone else after.</p>}
      <label className="field"><span>Email</span><input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></label>
      <label className="field"><span>Password</span><input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {error && <p className="alert" role="alert">{error}</p>}
      <button className="btn btn-primary login-btn" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
