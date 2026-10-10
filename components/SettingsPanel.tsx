"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { dateLabel, pct } from "@/lib/format";
import type { RepSetting, Settings } from "@/lib/types";
import { NumField, useToast } from "./inputs";

interface TestResult {
  base: string;
  shape: string;
  count: number;
  fieldNames: string[];
  mapped: Record<string, unknown> | null;
}
interface SyncResult {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  skippedReason: string[];
}

export function SettingsPanel({ settings, bp }: { settings: Settings; bp: { base: string; hasKey: boolean; subdomain: string } }) {
  const router = useRouter();
  const { toast, show } = useToast();
  const [reps, setReps] = useState<RepSetting[]>(settings.reps);
  const [target, setTarget] = useState(settings.targetMargin);
  const [allowance, setAllowance] = useState(settings.materialsAllowance);
  const [busy, setBusy] = useState<"" | "test" | "sync" | "save">("");
  const [test, setTest] = useState<TestResult | null>(null);
  const [sync, setSync] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveSettings = async (next: { targetMargin?: number; materialsAllowance?: number; reps?: RepSetting[] }) => {
    setBusy("save");
    const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    setBusy("");
    if (res.ok) {
      show("Saved");
      router.refresh();
    } else show((await res.json().catch(() => ({}))).error ?? "That didn't save.", "error");
  };

  const run = async (kind: "test" | "sync") => {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch("/api/builderprime", { method: kind === "test" ? "GET" : "POST" });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Builder Prime didn't answer.");
      else if (kind === "test") setTest(data);
      else {
        setSync(data);
        router.refresh();
      }
    } catch {
      setError("Couldn't reach the app. Check that it is still running.");
    }
    setBusy("");
  };

  return (
    <div className="settings">
      <section className="pane block">
        <h2 className="pane-title">Targets</h2>
        <div className="field-row">
          <label className="field"><span>Target gross profit</span><NumField kind="percent" label="Target gross profit" value={target} allowEmpty={false} onCommit={(v) => { setTarget(v ?? 0.5); saveSettings({ targetMargin: v ?? 0.5 }); }} /></label>
          <label className="field"><span>Materials allowance added to estimates</span><NumField kind="percent" label="Materials allowance" value={allowance} allowEmpty={false} onCommit={(v) => { setAllowance(v ?? 0.03); saveSettings({ materialsAllowance: v ?? 0.03 }); }} /></label>
        </div>
        <p className="hint">Actual materials are the materials estimate plus {pct(allowance, 1)} of the contract, the same as your spreadsheet. Type an actual amount on a job to override it.</p>
      </section>

      <section className="pane block">
        <h2 className="pane-title">Sales reps and commission</h2>
        <table className="mini reps-edit">
          <thead><tr><th>Rep</th><th className="num">Default commission</th><th /></tr></thead>
          <tbody>
            {reps.map((r, i) => (
              <tr key={i}>
                <td><input aria-label="Rep name" value={r.name} onChange={(e) => setReps(reps.map((x, j) => (j === i ? { ...x, name: e.target.value.toUpperCase() } : x)))} onBlur={() => saveSettings({ reps })} /></td>
                <td className="num"><NumField kind="percent" label={`Default commission for ${r.name}`} value={r.commissionRate} allowEmpty={false} onCommit={(v) => { const next = reps.map((x, j) => (j === i ? { ...x, commissionRate: v ?? 0 } : x)); setReps(next); saveSettings({ reps: next }); }} /></td>
                <td><button className="btn btn-small btn-quiet" onClick={() => { const next = reps.filter((_, j) => j !== i); setReps(next); saveSettings({ reps: next }); }}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn btn-small" onClick={() => setReps([...reps, { name: "", commissionRate: 0.1 }])}>Add rep</button>
        <p className="hint">New jobs use the rep's default rate. You only type a rate on a job when it differs.</p>
      </section>

      <section className="pane block bp">
        <h2 className="pane-title">Builder Prime</h2>
        <dl className="kv">
          <div><dt>Address</dt><dd>{bp.base}</dd></div>
          <div><dt>API key</dt><dd className={bp.hasKey ? "good" : "low"}>{bp.hasKey ? "Found in .env.local" : "Not found. Add BUILDERPRIME_API_KEY to .env.local and restart."}</dd></div>
          <div><dt>Last sync</dt><dd>{settings.builderPrime.lastSync ? dateLabel(settings.builderPrime.lastSync.slice(0, 10)) : "Never"}</dd></div>
        </dl>
        <div className="btn-row">
          <button className="btn" onClick={() => run("test")} disabled={busy !== ""}>{busy === "test" ? "Testing…" : "Test connection"}</button>
          <button className="btn btn-primary" onClick={() => run("sync")} disabled={busy !== "" || !bp.hasKey}>{busy === "sync" ? "Syncing…" : "Sync jobs now"}</button>
        </div>
        {error && <p className="alert" role="alert">{error}</p>}
        {test && (
          <div className="result">
            <p><strong>Connected.</strong> Builder Prime returned {test.count} project{test.count === 1 ? "" : "s"} ({test.shape}).</p>
            <p className="hint">Fields on each project: {test.fieldNames.join(", ") || "none"}</p>
            {test.mapped && <pre>{JSON.stringify(test.mapped, null, 2)}</pre>}
            <p className="hint">If a value above is empty or wrong, the matching field name goes first in lib/bp-mapping.ts.</p>
          </div>
        )}
        {sync && (
          <div className="result">
            <p><strong>Sync finished.</strong> {sync.fetched} projects checked: {sync.created} added, {sync.updated} updated, {sync.skipped} skipped.</p>
            {sync.skippedReason.map((r) => <p key={r} className="hint">{r}</p>)}
            <p className="hint">Your entered numbers are never overwritten by a sync.</p>
          </div>
        )}
      </section>
      {toast}
    </div>
  );
}
