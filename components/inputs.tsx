"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Job } from "@/lib/types";

/* ---------- toast ---------- */
export function useToast() {
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    setMsg({ text, tone });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), tone === "error" ? 6000 : 2200);
  }, []);
  const node = msg ? (
    <div className={`toast ${msg.tone}`} role="status" aria-live="polite">
      {msg.text}
    </div>
  ) : null;
  return { toast: node, show };
}

/* ---------- saving ---------- */
export function useJobApi(show: (t: string, tone?: "ok" | "error") => void) {
  const router = useRouter();
  const call = useCallback(
    async (url: string, method: string, payload?: unknown, success?: string): Promise<boolean> => {
      try {
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: payload === undefined ? undefined : JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          show(data.error ?? "That didn't save. Try again.", "error");
          return false;
        }
        if (success) show(success);
        router.refresh();
        return true;
      } catch {
        show("Couldn't reach the app. Check that it is still running.", "error");
        return false;
      }
    },
    [router, show],
  );
  return {
    patch: (id: string, changes: Partial<Job>, success?: string) => call(`/api/jobs/${id}`, "PATCH", changes, success),
    create: (job: Partial<Job>, success?: string) => call(`/api/jobs`, "POST", job, success),
    remove: (id: string, success?: string) => call(`/api/jobs/${id}`, "DELETE", undefined, success),
    complete: (id: string, input: { completeDate: string; finalAmount?: number; finalDate?: string | null }, success?: string) =>
      call(`/api/jobs/${id}/complete`, "POST", input, success),
    reopen: (id: string, success?: string) => call(`/api/jobs/${id}/reopen`, "POST", undefined, success),
  };
}

/* ---------- number field ---------- */
function parseNum(raw: string): number | null | "bad" {
  const t = raw.replace(/[$,%\s]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : "bad";
}

function trim(n: number, digits = 2) {
  return String(Math.round(n * 10 ** digits) / 10 ** digits);
}

export function NumField({
  value,
  onCommit,
  kind = "money",
  placeholder,
  needed = false,
  label,
  allowEmpty = true,
  className = "",
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  kind?: "money" | "percent";
  placeholder?: string;
  /** highlight as a missing entry */
  needed?: boolean;
  label: string;
  allowEmpty?: boolean;
  className?: string;
}) {
  const shown = value === null ? "" : kind === "percent" ? trim(value * 100, 3) : trim(value, 2);
  const pretty = value === null ? "" : kind === "percent" ? trim(value * 100, 3) : value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const [text, setText] = useState(pretty);
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setText(pretty);
  }, [pretty, focus]);

  const commit = () => {
    setFocus(false);
    const parsed = parseNum(text);
    if (parsed === "bad") {
      setText(pretty);
      return;
    }
    if (parsed === null && !allowEmpty) {
      setText(pretty);
      return;
    }
    const next = parsed === null ? null : kind === "percent" ? parsed / 100 : parsed;
    const same = next === value || (next !== null && value !== null && Math.abs(next - value) < 1e-9);
    if (!same) onCommit(next);
    else setText(pretty);
  };

  return (
    <span className={`numfield ${kind}${needed ? " needed" : ""} ${className}`}>
      {kind === "money" && <i aria-hidden="true">$</i>}
      <input
        inputMode="decimal"
        aria-label={label}
        value={focus ? text : text}
        placeholder={placeholder ?? (needed ? "add" : "")}
        onFocus={(e) => {
          setFocus(true);
          setText(shown);
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setText(pretty);
            setFocus(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {kind === "percent" && <i aria-hidden="true">%</i>}
    </span>
  );
}

/* ---------- modal shell ---------- */
export function Overlay({ onClose, children, side = false, label }: { onClose: () => void; children: React.ReactNode; side?: boolean; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={side ? "drawer" : "modal"} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  );
}
