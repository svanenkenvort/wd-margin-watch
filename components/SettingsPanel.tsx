"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { dateLabel, money, pct } from "@/lib/format";
import type { BpCandidate, BpReview, RepSetting, Settings } from "@/lib/types";
import { NumField, useToast } from "./inputs";
import { useSync, type SyncResult } from "./useSync";

interface TestResult {
  base: string;
  projects: number;
  sold: number;
  linked: number;
  firstSync: boolean;
  toRead: number;
  minutes: number;
}

/** Sold projects the sync could not place by itself: add them, link them to a job, or leave them out. */
function ReviewList({ review, onDone }: { review: BpReview; onDone: (msg: string) => void }) {
  const [busy, setBusy] = useState("");
  const [pick, setPick] = useState<Record<string, string>>({});
  const act = async (key: string, payload: Record<string, string>, msg: string) => {
    setBusy(key);
    const res = await fetch("/api/builderprime/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setBusy("");
    const data = await res.json().catch(() => ({}));
    onDone(res.ok ? msg : data.error ?? "That didn't work.");
  };
  const who = (c: BpCandidate) => (
    <>
      <strong>{c.name}</strong> <span className="muted">Builder Prime #{c.bpJobNumber} · {c.snapshot.projectName || c.snapshot.projectType} · {c.rep} · {c.snapshot.status}</span>
      <br />
      <small>Contract {money(c.snapshot.contracted, true)} · paid {money(c.snapshot.paid, true)} · cost {money(c.snapshot.cost, true)}</small>
    </>
  );
  if (!review.notInApp.length && !review.maybe.length) return <p className="hint">Every open sold project in Builder Prime is matched to a job.</p>;
  return (
    <div className="review">
      {review.maybe.length > 0 && (
        <>
          <h3>Same customer as a job in the app ({review.maybe.length})</h3>
          <p className="hint">The sync couldn&apos;t confirm it is that job (the contract value or sold date doesn&apos;t fit). Link it if it is the same job: Builder Prime&apos;s contract value then replaces the app&apos;s on an open job. If the customer came back and bought again, add it as a new job.</p>
          <ul>
            {review.maybe.map(({ project: c, jobs, createdOn }) => {
              const chosen = pick[c.projectId] ?? jobs[0]?.id;
              return (
                <li key={c.projectId}>
                  <div>{who(c)}{createdOn && <small> · created in Builder Prime {dateLabel(createdOn)}</small>}</div>
                  <div className="review-actions">
                    <select aria-label={`Job to link ${c.name} to`} value={chosen} onChange={(e) => setPick({ ...pick, [c.projectId]: e.target.value })}>
                      {jobs.map((j) => <option key={j.id} value={j.id}>{j.name} · {j.jobNumber || "no ProVia #"} · {money(j.contractValue, true)} · sold {j.soldDate ? dateLabel(j.soldDate) : "?"} · {j.state}</option>)}
                    </select>
                    <button className="btn btn-small btn-primary" disabled={!!busy} onClick={() => act(c.projectId, { action: "link", projectId: c.projectId, jobId: chosen }, `${c.name} linked`)}>Link</button>
                    <button className="btn btn-small" disabled={!!busy} onClick={() => act(c.projectId, { action: "add", projectId: c.projectId }, `${c.name} added as an open job`)}>Add as new job</button>
                    <button className="btn btn-small btn-quiet" disabled={!!busy} onClick={() => act(c.projectId, { action: "ignore", projectId: c.projectId }, `${c.name} left out`)}>Leave out</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {review.notInApp.length > 0 && (
        <>
          <h3>Not in the app ({review.notInApp.length})</h3>
          <p className="hint">Open sold projects with no job of that customer&apos;s name. Add the ones that are real open jobs; leave out any that are finished or not yours to track.</p>
          <button className="btn btn-small btn-primary" disabled={!!busy} onClick={() => act("all", { action: "addAll" }, `${review.notInApp.length} added as open jobs`)}>Add all {review.notInApp.length} as open jobs</button>
          <ul>
            {review.notInApp.map((c) => (
              <li key={c.projectId}>
                <div>{who(c)}</div>
                <div className="review-actions">
                  <button className="btn btn-small" disabled={!!busy} onClick={() => act(c.projectId, { action: "add", projectId: c.projectId }, `${c.name} added as an open job`)}>Add as open job</button>
                  <button className="btn btn-small btn-quiet" disabled={!!busy} onClick={() => act(c.projectId, { action: "ignore", projectId: c.projectId }, `${c.name} left out`)}>Leave out</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function SettingsPanel({ settings, bp, review }: { settings: Settings; bp: { base: string; hasKey: boolean; subdomain: string }; review: BpReview | null }) {
  const router = useRouter();
  const { toast, show } = useToast();
  const [reps, setReps] = useState<RepSetting[]>(settings.reps);
  const [target, setTarget] = useState(settings.targetMargin);
  const [allowance, setAllowance] = useState(settings.materialsAllowance);
  const [busy, setBusy] = useState<"" | "test" | "save">("");
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

  const syncer = useSync((data, err) => {
    if (err) setError(err);
    else if (data) {
      setSync(data);
      router.refresh();
    }
  });

  const run = async (kind: "test" | "sync") => {
    setError(null);
    if (kind === "sync") return syncer.start();
    setBusy(kind);
    try {
      const res = await fetch("/api/builderprime", { method: "GET" });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Builder Prime didn't answer.");
      else setTest(data);
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
          <label className="field"><span>Target margin after commission</span><NumField kind="percent" label="Target margin after commission" value={target} allowEmpty={false} onCommit={(v) => { setTarget(v ?? 0.4); saveSettings({ targetMargin: v ?? 0.4 }); }} /></label>
          <label className="field"><span>Materials allowance added to estimates</span><NumField kind="percent" label="Materials allowance" value={allowance} allowEmpty={false} onCommit={(v) => { setAllowance(v ?? 0.03); saveSettings({ materialsAllowance: v ?? 0.03 }); }} /></label>
        </div>
        <p className="hint">Actual materials are the materials estimate plus {pct(allowance, 1)} of the contract, the same as your spreadsheet. Type an actual amount on a job to override it. Every margin in the app is after commission: the commission due on the job, or what was paid if that is more.</p>
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
          <button className="btn btn-primary" onClick={() => run("sync")} disabled={busy !== "" || syncer.running || !bp.hasKey}>{syncer.running ? "Syncing…" : "Sync jobs now"}</button>
        </div>
        {error && <p className="alert" role="alert">{error}</p>}
        {syncer.running && (
          <div className={`sync-panel${syncer.waiting ? " waiting" : ""}`} role="status" aria-live="polite">
            <strong>{syncer.status}</strong>
            <p className="hint">Builder Prime answers about 80 requests, then makes the app wait about 40 seconds. The first sync reads every sold project, so it takes a few minutes. Keep this page open until it finishes; if you leave, the next sync carries on where it stopped.</p>
          </div>
        )}
        {test && (
          <div className="result">
            <p><strong>Connected.</strong> Builder Prime has {test.projects} projects, {test.sold} of them sold; {test.linked} are linked to jobs here. Nothing was saved.</p>
            <p className="hint">
              {test.firstSync ? "This will be the first sync: it links your existing jobs and lists anything it can't match. " : ""}
              The next sync reads {test.toRead} project{test.toRead === 1 ? "" : "s"} in detail, about {test.minutes} minute{test.minutes === 1 ? "" : "s"}.
            </p>
          </div>
        )}
        {sync && (
          <div className="result">
            <p><strong>Sync finished.</strong> {sync.sold} sold projects checked: {sync.created} new open job{sync.created === 1 ? "" : "s"}, {sync.linked} existing job{sync.linked === 1 ? "" : "s"} linked, {sync.updated} updated.</p>
            {sync.firstSync && <p className="hint">First sync: projects already sold were matched to your jobs, not added. From now on each new sale comes in as an open job.</p>}
            {sync.changes.map((ch) => <p key={ch} className="hint">{ch}</p>)}
            {sync.review.notInApp + sync.review.maybe > 0 && <p className="hint warn">{sync.review.notInApp + sync.review.maybe} project{sync.review.notInApp + sync.review.maybe === 1 ? " needs" : "s need"} a look below.</p>}
          </div>
        )}
      </section>

      <section className="pane block" id="builder-prime-review">
        <h2 className="pane-title">Builder Prime: needs a look</h2>
        {review ? <ReviewList review={review} onDone={(m) => { show(m); router.refresh(); }} /> : <p className="hint">Run a sync to match Builder Prime projects to your jobs.</p>}
      </section>
      {toast}
    </div>
  );
}
