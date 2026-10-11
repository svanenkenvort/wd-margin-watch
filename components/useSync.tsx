"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface SyncResult {
  firstSync: boolean;
  fetched: number;
  sold: number;
  detailsRead: number;
  created: number;
  linked: number;
  updated: number;
  changes: string[];
  review: { notInApp: number; maybe: number };
}

interface Progress {
  running: boolean;
  step: "list" | "details" | "saving" | "";
  done: number;
  total: number;
  waitLeft: number;
  last: { at: string; report?: SyncResult; error?: string } | null;
}

/**
 * Runs a Builder Prime sync and follows it: polls its progress every second and counts down
 * while Builder Prime makes it wait. A page opened during a sync (started elsewhere) picks it up too.
 */
export function useSync(onFinished: (result: SyncResult | null, error: string | null) => void) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [waitEnd, setWaitEnd] = useState<number | null>(null);
  const [, tick] = useState(0);
  const following = useRef(false);
  const finished = useRef(onFinished);
  finished.current = onFinished;

  const poll = useCallback(async () => {
    const p: Progress | null = await fetch("/api/builderprime/progress", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!p) return null;
    setProgress(p);
    setWaitEnd(p.waitLeft > 0 ? Date.now() + p.waitLeft : null);
    return p;
  }, []);

  /** Polls until the sync stops; reports the result when this page didn't start it. */
  const follow = useCallback(
    async (startedHere: boolean) => {
      if (following.current) return;
      following.current = true;
      for (;;) {
        await new Promise((r) => setTimeout(r, 1000));
        const p = await poll();
        if (p && !p.running) break;
      }
      following.current = false;
      if (!startedHere) {
        const last = (await poll())?.last;
        finished.current(last?.report ?? null, last?.error ?? null);
      }
    },
    [poll],
  );

  useEffect(() => {
    poll().then((p) => {
      if (p?.running) follow(false);
    });
  }, [poll, follow]);

  // Redraw the countdown every quarter second while waiting.
  useEffect(() => {
    if (!waitEnd) return;
    const t = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [waitEnd]);

  const start = useCallback(async () => {
    setProgress({ running: true, step: "list", done: 0, total: 0, waitLeft: 0, last: null });
    follow(true);
    try {
      const res = await fetch("/api/builderprime", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) finished.current(data as SyncResult, null);
      else finished.current(null, data.error ?? "Builder Prime didn't answer.");
    } catch {
      finished.current(null, "Couldn't reach the app. Check that it is still running.");
    }
    await poll();
  }, [follow, poll]);

  const running = !!progress?.running;
  const secondsLeft = waitEnd ? Math.max(0, Math.ceil((waitEnd - Date.now()) / 1000)) : 0;
  return { start, running, status: running && progress ? statusText(progress, secondsLeft) : "", waiting: running && secondsLeft > 0 };
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function statusText(p: Progress, secondsLeft: number): string {
  const where = p.step === "details" && p.total ? `${p.done} of ${p.total} jobs read` : p.step === "saving" ? "saving" : "reading the project list";
  if (secondsLeft > 0) return `Builder Prime rate limit: waiting ${clock(secondsLeft)}, then carrying on (${where})`;
  if (p.step === "details") return p.total ? `Reading job details from Builder Prime: ${p.done} of ${p.total}` : "Reading job details from Builder Prime";
  if (p.step === "saving") return "Saving…";
  return "Reading the Builder Prime project list…";
}
