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
              const review = data.review.notInApp + data.review.maybe;
              show(`Builder Prime synced: ${data.created} new open job${data.created === 1 ? "" : "s"}, ${data.linked + data.updated} updated${review ? `, ${review} to review in Settings` : ""}`);
              router.refresh();
            }
          } catch {
            show("Couldn't reach the app. Check that it is still running.", "error");
          }
          setBusy(false);
        }}
      >
        {busy ? "Syncing… (can take a few minutes)" : "Sync Builder Prime"}
      </button>
      {toast}
    </>
  );
}
