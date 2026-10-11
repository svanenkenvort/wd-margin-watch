"use client";

import { useMemo, useState } from "react";
import { dateLabel, money, pct, repLabel } from "@/lib/format";
import type { Row } from "@/lib/stats";
import type { Settings } from "@/lib/types";
import { JobDrawer } from "./JobDrawer";
import { NumField, useJobApi, useToast } from "./inputs";

type Filter = "all" | "low" | "balance" | "labor" | "commission";
type SortKey = "date" | "contract" | "margin";

const tone = (p: number | null, target: number) => (p === null ? "" : p >= target ? "good" : p >= target - 0.05 ? "warn" : "low");

export function CompletedTable({ rows, settings, year, initialJobId }: { rows: Row[]; settings: Settings; year: number; initialJobId?: string }) {
  const { toast, show } = useToast();
  const api = useJobApi(show);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortKey>("date");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [editing, setEditing] = useState<string | null>(initialJobId ?? null);
  const target = settings.targetMargin;

  const counts = useMemo(
    () => ({
      low: rows.filter((r) => r.c.afterCommissionPct !== null && r.c.afterCommissionPct < target).length,
      balance: rows.filter((r) => r.c.balance > 1).length,
      labor: rows.filter((r) => r.job.laborActual === null).length,
      commission: rows.filter((r) => r.c.commissionOwed > 1).length,
    }),
    [rows, target],
  );

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const out = rows.filter(({ job, c }) => {
      if (t && !`${job.name} ${job.jobNumber} ${job.product} ${job.rep}`.toLowerCase().includes(t)) return false;
      if (filter === "low") return c.afterCommissionPct !== null && c.afterCommissionPct < target;
      if (filter === "balance") return c.balance > 1;
      if (filter === "labor") return job.laborActual === null;
      if (filter === "commission") return c.commissionOwed > 1;
      return true;
    });
    return [...out].sort((a, b) => {
      const v =
        sort === "date" ? (a.job.completeDate ?? "").localeCompare(b.job.completeDate ?? "")
        : sort === "contract" ? a.job.contractValue - b.job.contractValue
        : (a.c.afterCommissionPct ?? 9) - (b.c.afterCommissionPct ?? 9);
      return v * dir;
    });
  }, [rows, q, filter, sort, dir, target]);

  const head = (key: SortKey, label: string, cls = "") => (
    <th className={cls} aria-sort={sort === key ? (dir === 1 ? "ascending" : "descending") : "none"}>
      <button className="th-btn" onClick={() => (sort === key ? setDir((d) => (d === 1 ? -1 : 1)) : (setSort(key), setDir(key === "margin" ? 1 : -1)))}>
        {label}
        {sort === key ? (dir === 1 ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );

  const editJob = editing ? rows.find((r) => r.job.id === editing)?.job ?? null : null;
  const chip = (key: Filter, label: string, n?: number) => (
    <button className={`chip${filter === key ? " on" : ""}`} onClick={() => setFilter(key)} aria-pressed={filter === key}>
      {label} {n !== undefined && <b>{n}</b>}
    </button>
  );

  return (
    <>
      <div className="toolbar">
        <input className="search" type="search" placeholder="Search name, job number or product" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search completed jobs" />
        <div className="chip-row" role="group" aria-label="Filters">
          {chip("all", "All", rows.length)}
          {chip("low", "Under target", counts.low)}
          {chip("balance", "Balance owed", counts.balance)}
          {chip("labor", "No labor paid", counts.labor)}
          {chip("commission", "Commission owed", counts.commission)}
        </div>
        <span className="grow" />
        <a className="btn" href={`/api/export?year=${year}`}>Download {year} as CSV</a>
      </div>

      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th className="sticky-col">Customer</th>
              {head("date", "Completed")}
              {head("contract", "Contract", "num")}
              <th className="num">Balance</th>
              <th className="num">Materials</th>
              <th className="num entry-col">Labor paid</th>
              <th className="num">Finance</th>
              <th className="num">Gross profit</th>
              <th>Rep</th>
              <th className="num">Commission paid</th>
              <th className="num">Owed</th>
              <th className="num">After commission</th>
              {head("margin", "Margin", "num")}
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={14} className="empty-row">{rows.length === 0 ? `No jobs were completed in ${year}.` : "No jobs match that filter."}</td></tr>}
            {list.map(({ job, c }) => (
              <tr key={job.id}>
                <td className="sticky-col">
                  <button className="linkish" onClick={() => setEditing(job.id)}>{job.name}</button>
                  <small>{job.jobNumber} {job.product && <>· {job.product}</>}</small>
                </td>
                <td className="nowrap">{dateLabel(job.completeDate)}</td>
                <td className="num">{money(job.contractValue)}</td>
                <td className={`num${c.balance > 1 ? " low" : " muted"}`}>{c.balance > 1 ? money(c.balance) : "Paid"}</td>
                <td className="num">{money(c.materialsActual)}</td>
                <td className="num entry-col"><NumField label={`Labor paid for ${job.name}`} value={job.laborActual} needed={job.laborActual === null} onCommit={(v) => api.patch(job.id, { laborActual: v })} /></td>
                <td className="num muted">{c.financeCharges > 0 ? money(c.financeCharges) : "–"}</td>
                <td className="num">{c.grossActual === null ? <span className="muted">needs labor</span> : money(c.grossActual)}</td>
                <td className="nowrap">{repLabel(job.rep) || "–"}</td>
                <td className="num">{job.commissionPaid ? money(job.commissionPaid) : "–"}</td>
                <td className={`num${c.commissionOwed > 1 ? " low" : " muted"}`}>{c.commissionOwed > 1 ? money(c.commissionOwed) : "–"}</td>
                <td className="num">{c.grossAfterCommission === null ? <span className="muted">needs labor</span> : money(c.grossAfterCommission)}</td>
                <td className={`num pcell ${tone(c.afterCommissionPct, target)}`}>{pct(c.afterCommissionPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="table-foot">{list.length} of {rows.length} jobs. Click a customer to correct anything on the job.</p>
      {editing && editJob && <JobDrawer job={editJob} settings={settings} api={api} onClose={() => setEditing(null)} />}
      {toast}
    </>
  );
}
