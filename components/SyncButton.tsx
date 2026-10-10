"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "./inputs";

export function SyncButton() {
  const router = useRouter();
  const { toast, show } = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const res = await fetch("/api/builderprime", { method: "POST" });
            const data = await res.json();
            if (!res.ok) show(data.error ?? "Builder Prime didn't answer.", "error");
            else {
              show(data.firstSync ? "Builder Prime connected. New sales come in from the next sync." : `Builder Prime synced: ${data.created} new sale${data.created === 1 ? "" : "s"} added`);
              router.refresh();
            }
          } catch {
            show("Couldn't reach the app. Check that it is still running.", "error");
          }
          setBusy(false);
        }}
      >
        {busy ? "Syncing…" : "Sync Builder Prime"}
      </button>
      {toast}
    </>
  );
}
