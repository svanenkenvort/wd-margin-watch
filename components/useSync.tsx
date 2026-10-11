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

type Step =
  | { status: "working" | "wait" | "busy"; step: "list" | "details"; done: number; total: number; waitMs: number }
  | { status: "done"; report: SyncResult };

interface Shown {
  kind: "list" | "details" | "wait" | "busy";
  done: number;
  total: number;
}

/**
 * Runs a Builder Prime sync as a series of short steps (each one request), and shows where it is.
 * When Builder Prime makes it wait, it counts down and then carries on. Leaving the page stops
 * asking; the next sync carries on from where it got to.
 */
export function useSync(onFinished: (result: SyncResult | null, error: string | null) => void) {
  const [running, setRunning] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  const [waitEnd, setWaitEnd] = useState<number | null>(null);
  const [, tick] = useState(0);
  const alive = useRef(true);
  const finished = useRef(onFinished);
  finished.current = onFinished;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Redraw the countdown every quarter second while waiting.
  useEffect(() => {
    if (!waitEnd) return;
    const t = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [waitEnd]);

  const start = useCallback(async () => {
    setRunning(true);
    setShown({ kind: "list", done: 0, total: 0 });
    let total = 0;
    let done = 0;
    try {
      while (alive.current) {
        const res = await fetch("/api/builderprime", { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          finished.current(null, data.error ?? "Builder Prime didn't answer.");
          break;
        }
        const step = data as Step;
        if (step.status === "done") {
          finished.current(step.report, null);
          break;
        }
        if (step.total) {
          total = step.total;
          done = step.done;
        }
        if (step.status === "working") {
          setShown({ kind: step.step, done, total });
          continue;
        }
        setShown({ kind: step.status, done, total });
        const end = Date.now() + step.waitMs;
        setWaitEnd(end);
        while (alive.current && Date.now() < end) await new Promise((r) => setTimeout(r, 250));
        setWaitEnd(null);
      }
    } catch {
      finished.current(null, "Couldn't reach the app. Check your connection and sync again; it carries on where it stopped.");
    }
    if (alive.current) {
      setRunning(false);
      setShown(null);
      setWaitEnd(null);
    }
  }, []);

  const secondsLeft = waitEnd ? Math.max(0, Math.ceil((waitEnd - Date.now()) / 1000)) : 0;
  return { start, running, status: running && shown ? statusText(shown, secondsLeft) : "", waiting: running && secondsLeft > 0 };
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function statusText(s: Shown, secondsLeft: number): string {
  const where = s.total ? `${s.done} of ${s.total} jobs read` : "reading the project list";
  if (s.kind === "wait") return `Builder Prime rate limit: waiting ${clock(secondsLeft)}, then carrying on (${where})`;
  if (s.kind === "busy") return `Another sync is running: checking again in ${clock(secondsLeft)}`;
  if (s.kind === "details") return s.total ? `Reading job details from Builder Prime: ${s.done} of ${s.total}` : "Reading job details from Builder Prime";
  return "Reading the Builder Prime project list…";
}
