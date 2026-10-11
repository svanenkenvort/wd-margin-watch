"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { dateLabel } from "@/lib/format";
import type { PublicUser } from "@/lib/users";
import { useToast } from "./inputs";

const MIN = 10;

/** Who can sign in. Admins add and remove people and reset passwords; everyone can change their own. */
export function UsersPanel({ me, users }: { me: PublicUser; users: PublicUser[] }) {
  const router = useRouter();
  const { toast, show } = useToast();
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState({ name: "", email: "", password: "", admin: false });
  const [mine, setMine] = useState({ current: "", password: "" });

  const call = async (method: string, payload: unknown, done: string, url = "/api/users") => {
    setBusy(true);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: payload === undefined ? undefined : JSON.stringify(payload) }).catch(() => null);
    setBusy(false);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok) {
      show(done);
      router.refresh();
      return true;
    }
    show(data.error ?? "That didn't work.", "error");
    return false;
  };

  return (
    <section className="pane block" id="users">
      <h2 className="pane-title">People who can sign in</h2>
      <ul className="users-list">
        {users.map((u) => (
          <li key={u.id}>
            <div>
              <strong>{u.name}</strong> {u.admin && <span className="tag">Admin</span>} {u.id === me.id && <span className="muted">(you)</span>}
              <br />
              <small>{u.email} · added {dateLabel(u.createdAt.slice(0, 10))}</small>
            </div>
            {me.admin && u.id !== me.id && (
              <div className="review-actions">
                <button className="btn btn-small" disabled={busy} onClick={() => {
                  const pw = window.prompt(`New password for ${u.name} (at least ${MIN} characters). Tell them, and they can change it after signing in.`);
                  if (pw) call("PATCH", { id: u.id, password: pw }, `Password reset for ${u.name}`);
                }}>Reset password</button>
                <button className="btn btn-small btn-quiet" disabled={busy} onClick={() => call("PATCH", { id: u.id, admin: !u.admin }, u.admin ? `${u.name} is no longer an admin` : `${u.name} is now an admin`)}>
                  {u.admin ? "Remove admin" : "Make admin"}
                </button>
                <button className="btn btn-small btn-quiet" disabled={busy} onClick={() => {
                  if (window.confirm(`Remove ${u.name}? They won't be able to sign in.`)) call("DELETE", undefined, `${u.name} removed`, `/api/users?id=${encodeURIComponent(u.id)}`);
                }}>Remove</button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {me.admin && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await call("POST", add, `${add.name} can now sign in`)) setAdd({ name: "", email: "", password: "", admin: false });
          }}
        >
          <h3 className="pane-subtitle">Add someone</h3>
          <div className="field-row">
            <label className="field"><span>Name</span><input required value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} /></label>
            <label className="field"><span>Email</span><input type="email" required value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} /></label>
          </div>
          <div className="field-row">
            <label className="field"><span>Starting password ({MIN}+ characters)</span><input type="text" required minLength={MIN} autoComplete="new-password" value={add.password} onChange={(e) => setAdd({ ...add, password: e.target.value })} /></label>
            <label className="field check"><input type="checkbox" checked={add.admin} onChange={(e) => setAdd({ ...add, admin: e.target.checked })} /><span>Admin (can add and remove people)</span></label>
          </div>
          <button className="btn btn-primary" disabled={busy}>Add person</button>
          <p className="hint">Give them the email and starting password; they can change the password under Settings after signing in.</p>
        </form>
      )}

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await call("PATCH", mine, "Password changed. Other devices are signed out.")) setMine({ current: "", password: "" });
        }}
      >
        <h3 className="pane-subtitle">Change your password</h3>
        <div className="field-row">
          <label className="field"><span>Current password</span><input type="password" autoComplete="current-password" required value={mine.current} onChange={(e) => setMine({ ...mine, current: e.target.value })} /></label>
          <label className="field"><span>New password ({MIN}+ characters)</span><input type="password" autoComplete="new-password" required minLength={MIN} value={mine.password} onChange={(e) => setMine({ ...mine, password: e.target.value })} /></label>
        </div>
        <button className="btn" disabled={busy}>Change password</button>
      </form>
      {toast}
    </section>
  );
}
