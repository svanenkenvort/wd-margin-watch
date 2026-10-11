"use client";

export function SignOutButton() {
  return (
    <button
      className="btn btn-small btn-quiet"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
        window.location.assign("/login");
      }}
    >
      Sign out
    </button>
  );
}
