"use client";

import { useMemo, useState } from "react";
import { dateLabel, money, pct, repLabel, todayISO } from "@/lib/format";
import { STAGES, stageMeta, type Job, type Settings } from "@/lib/types";
import type { Row } from "@/lib/stats";
import { JobDrawer } from "./JobDrawer";
import { BpFlags, MissingLine } from "./JobTodo";
import { DateCell, NumField, Overlay, TextField, useJobApi, useToast } from "./inputs";

type SortKey = "oldest" | "newest" | "largest" | "margin";

const tone = (p: number | null, target: number) => (p === null ? "" : p >= target ? "good" : p >= target - 0.05 ? "warn" : "low");

export function OpenJobsTable({ rows, settings, initialJobId, review = 0 }: { rows: Row[]; settings: Settings; initialJobId?: string; review?: number }) {
  const { toast, show } = useToast();
  const api = useJobApi(show);
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<string>("all");
  const [rep, setRep] = useState<string>("all");
  const [needsOnly, setNeedsOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("oldest");
  const [editing, setEditing] = useState<string | null | "new">(initialJobId ?? null);
  const [completing, setCompleting] = useState<Job | null>(null);
  const target = settings.targetMargin;

  const reps = useMemo(() => [...new Set(rows.map((r) => r.job.rep).filter(Boolean))], [rows]);
  const needs = rows.filter((r) => r.c.missing.length > 0).length;

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    let out = rows.filter(({ job, c }) => {
      if (t && !`${job.name} ${job.jobNumber} ${job.product} ${job.rep}`.toLowerCase().includes(t)) return false;
      if (stage !== "all" && (job.stage ?? "none") !== stage) return false;
      if (rep !== "all" && job.rep !== rep) return false;
      if (needsOnly && c.missing.length === 0) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      if (sort === "oldest") return (a.job.soldDate ?? "").localeCompare(b.job.soldDate ?? "");
      if (sort === "newest") return (b.job.soldDate ?? "").localeCompare(a.job.soldDate ?? "");
      if (sort === "largest") return b.job.contractValue - a.job.contractValue;
      return a.c.estAfterCommissionPct - b.c.estAfterCommissionPct;
    });
    return out;
  }, [rows, q, stage, rep, needsOnly, sort]);

  const editJob = editing && editing !== "new" ? rows.find((r) => r.job.id === editing)?.job ?? null : null;

  return (
    <>
      <div className="toolbar">
        <input className="search" type="search" placeholder="Search name, job number or product" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search open jobs" />
        <select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Filter by stage">
          <option value="all">All stages</option>
          {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          <option value="none">No stage set</option>
        </select>
        <select value={rep} onChange={(e) => setRep(e.target.value)} aria-label="Filter by rep">
          <option value="all">All reps</option>
          {reps.map((r) => <option key={r} value={r}>{repLabel(r)}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort jobs">
          <option value="oldest">Oldest sale first</option>
          <option value="newest">Newest sale first</option>
          <option value="largest">Largest contract first</option>
          <option value="margin">Lowest estimated margin first</option>
        </select>
        <button className={`chip${needsOnly ? " on" : ""}`} onClick={() => setNeedsOnly((v) => !v)} aria-pressed={needsOnly}>
          Still to enter <b>{needs}</b>
        </button>
        <span className="grow" />
        <button className="btn btn-primary" onClick={() => setEditing("new")}>New job</button>
      </div>

      {review > 0 && (
        <p className="banner">
          {review} sold project{review === 1 ? " in Builder Prime isn't" : "s in Builder Prime aren't"} matched to a job yet. <a href="/settings#builder-prime-review">Review them</a> to add or link them.
        </p>
      )}
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr className="group-row">
              <th colSpan={3} className="sticky-col">Job</th>
              <th colSpan={3}>Money in</th>
              <th colSpan={5} className="entry-head">You enter</th>
              <th colSpan={2}>Margin after commission</th>
              <th colSpan={3} className="entry-head">Commission</th>
              <th />
            </tr>
            <tr>
              <th className="sticky-col">Customer</th>
              <th>Sold</th>
              <th>Stage</th>
              <th className="num">Contract</th>
              <th className="num">Paid</th>
              <th className="num">Balance</th>
              <th className="num entry-col">Materials est.</th>
              <th className="num entry-col">Labor est.</th>
              <th className="num entry-col">Finance</th>
              <th className="num entry-col">Materials paid</th>
              <th className="num entry-col">Labor paid</th>
              <th className="num">Estimated</th>
              <th className="num">Actual</th>
              <th>Rep</th>
              <th className="num entry-col">Rate</th>
              <th className="num entry-col">Paid</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={17} className="empty-row">{rows.length === 0 ? "No open jobs yet. Sync Builder Prime or add a job." : "No jobs match those filters."}</td></tr>
            )}
            {list.map(({ job, c }) => {
              const meta = stageMeta(job.stage);
              const defaultRate = settings.reps.find((r) => r.name === job.rep)?.commissionRate;
              return (
                <tr key={job.id}>
                  <td className="sticky-col">
                    <button className="linkish" onClick={() => setEditing(job.id)}>{job.name}</button>
                    {job.jobNumber ? (
                      <small>{job.jobNumber} {job.product && <>· {job.product}</>}</small>
                    ) : (
                      <TextField label={`ProVia Order # for ${job.name}`} placeholder="ProVia Order #" value="" needed onCommit={(v) => v && api.patch(job.id, { jobNumber: v }, "ProVia Order # saved")} />
                    )}
                    {job.builderPrimeJobNumber && <small>Builder Prime #{job.builderPrimeJobNumber}</small>}
                    <MissingLine missing={c.missing.filter((m) => m.field !== "jobNumber" && m.field !== "soldDate")} onOpen={() => setEditing(job.id)} />
                    <BpFlags checks={c.checks} onOpen={() => setEditing(job.id)} />
                  </td>
                  <td className="nowrap">
                    {job.soldDate ? dateLabel(job.soldDate, false) : <DateCell label={`Date sold for ${job.name}`} value={null} needed onCommit={(v) => v && api.patch(job.id, { soldDate: v }, "Date sold saved")} />}
                  </td>
                  <td>
                    <select
                      className="stage-select"
                      style={{ ["--stage" as string]: meta?.color ?? "#B8C3C5" }}
                      value={job.stage ?? ""}
                      aria-label={`Stage for ${job.name}`}
                      onChange={(e) => api.patch(job.id, { stage: (e.target.value || null) as Job["stage"] })}
                    >
                      <option value="">No stage</option>
                      {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </td>
                  <td className="num">{money(job.contractValue)}</td>
                  <td className="num">{job.financed && !c.totalPayments ? <span className="tag">Financed</span> : money(c.totalPayments)}</td>
                  <td className={`num${c.balance > 1 ? "" : " muted"}`}>{money(c.balance)}</td>
                  <td className="num entry-col"><NumField label={`Materials estimate for ${job.name}`} value={job.materialsEst} needed={job.materialsEst === null} onCommit={(v) => api.patch(job.id, { materialsEst: v })} /></td>
                  <td className="num entry-col"><NumField label={`Labor estimate for ${job.name}`} value={job.laborEst} needed={job.laborEst === null} onCommit={(v) => api.patch(job.id, { laborEst: v })} /></td>
                  <td className="num entry-col"><NumField kind="percent" label={`Finance percent for ${job.name}`} value={job.financePct} allowEmpty={false} onCommit={(v) => api.patch(job.id, { financePct: v ?? 0 })} /></td>
                  <td className="num entry-col"><NumField label={`Materials paid for ${job.name}`} value={job.materialsPaid} onCommit={(v) => api.patch(job.id, { materialsPaid: v })} /></td>
                  <td className="num entry-col"><NumField label={`Labor paid for ${job.name}`} value={job.laborActual} onCommit={(v) => api.patch(job.id, { laborActual: v })} /></td>
                  <td className={`num pcell ${tone(c.estAfterCommissionPct, target)}`}>{pct(c.estAfterCommissionPct)}</td>
                  <td className={`num nowrap pcell ${tone(c.afterCommissionPct, target)}`}>{c.afterCommissionPct === null ? <span className="muted">needs labor</span> : pct(c.afterCommissionPct)}</td>
                  <td className="nowrap">{repLabel(job.rep) || "–"}</td>
                  <td className="num entry-col"><NumField kind="percent" label={`Commission rate for ${job.name}`} value={job.commissionRate ?? defaultRate ?? null} onCommit={(v) => api.patch(job.id, { commissionRate: v })} /></td>
                  <td className="num entry-col"><NumField label={`Commission paid for ${job.name}`} value={job.commissionPaid} allowEmpty={false} onCommit={(v) => api.patch(job.id, { commissionPaid: v ?? 0 })} /></td>
                  <td className="actions"><button className="btn btn-small" onClick={() => setCompleting(job)}>Complete</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="table-foot">{list.length} of {rows.length} open jobs. Margins are after commission due. Estimated margin turns amber within 5 points of the {pct(target, 0)} target and red below that.</p>

      {editing && (editing === "new" || editJob) && <JobDrawer job={editing === "new" ? null : editJob} settings={settings} api={api} onClose={() => setEditing(null)} />}
      {completing && <CompleteModal job={completing} api={api} onClose={() => setCompleting(null)} balance={rows.find((r) => r.job.id === completing.id)?.c.balance ?? 0} />}
      {toast}
    </>
  );
}

function CompleteModal({ job, balance, api, onClose }: { job: Job; balance: number; api: ReturnType<typeof useJobApi>; onClose: () => void }) {
  const [date, setDate] = useState(todayISO());
  const [finalAmount, setFinalAmount] = useState<number | null>(Math.max(0, Math.round(balance * 100) / 100));
  const [finalDate, setFinalDate] = useState<string | null>(todayISO());
  const [busy, setBusy] = useState(false);
  const year = Number(date.slice(0, 4)) || new Date().getFullYear();
  return (
    <Overlay onClose={onClose} label={`Complete ${job.name}`}>
      <h2>Complete {job.name}</h2>
      <p className="sub">The job moves to {year} completed jobs. Nothing to copy and paste.</p>
      <label className="field"><span>Install completed</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <div className="field-row">
        <label className="field"><span>Final payment received now</span><NumField label="Final payment" value={finalAmount} onCommit={setFinalAmount} /></label>
        <label className="field"><span>Final payment date</span><input type="date" value={finalDate ?? ""} onChange={(e) => setFinalDate(e.target.value || null)} /></label>
      </div>
      <p className="hint">Set the amount to $0 if the customer hasn't paid yet. The balance will show as owed on the Completed tab.</p>
      {job.laborActual === null && <p className="hint warn">Labor paid is still empty. You can add it later from Completed jobs.</p>}
      <div className="modal-foot">
        <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
        <button
          className="btn btn-primary"
          disabled={busy || !date}
          onClick={async () => {
            setBusy(true);
            const ok = await api.complete(job.id, { completeDate: date, finalAmount: (job.finalAmount || 0) + (finalAmount ?? 0), finalDate: finalAmount ? finalDate : job.finalDate }, `${job.name} moved to completed`);
            setBusy(false);
            if (ok) onClose();
          }}
        >
          Move to completed
        </button>
      </div>
    </Overlay>
  );
}
