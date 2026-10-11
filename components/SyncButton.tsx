"use client";

import { useRouter } from "next/navigation";
import { useToast } from "./inputs";
import { useSync } from "./useSync";

export function SyncButton() {
  const router = useRouter();
  const { toast, show } = useToast();
  const sync = useSync((data, error) => {
    if (error) return show(error, "error");
    if (!data) return;
    const review = data.review.notInApp + data.review.maybe;
    show(`Builder Prime synced: ${data.created} new open job${data.created === 1 ? "" : "s"}, ${data.linked + data.updated} updated${review ? `, ${review} to review in Settings` : ""}`);
    router.refresh();
  });
  return (
    <>
      {sync.running && <span className={`sync-status${sync.waiting ? " waiting" : ""}`} role="status" aria-live="polite">{sync.status}</span>}
      <button className="btn" disabled={sync.running} onClick={sync.start}>
        {sync.running ? "Syncing…" : "Sync Builder Prime"}
      </button>
      {toast}
    </>
  );
}
