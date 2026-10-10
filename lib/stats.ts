import { compute, type Computed } from "./calc";
import { daysSince } from "./format";
import { STAGES, type Job, type Settings, type Stage } from "./types";

export interface Row {
  job: Job;
  c: Computed;
}

export const toRows = (jobs: Job[], settings: Settings): Row[] =>
  jobs.map((job) => ({ job, c: compute(job, settings) }));

export interface Summary {
  count: number;
  revenue: number;
  financeCharges: number;
  materials: number;
  labor: number;
  gross: number; // actual gross profit on jobs that have actuals
  grossBase: number; // contract value of those jobs
  grossPct: number | null;
  estPct: number | null;
  commissionPaid: number;
  commissionOwed: number;
  afterCommission: number;
  afterCommissionPct: number | null;
  collected: number;
  balance: number;
  averageJob: number;
  withoutActuals: number;
}

export function summarize(rows: Row[]): Summary {
  let revenue = 0, financeCharges = 0, materials = 0, labor = 0, gross = 0, grossBase = 0;
  let commissionPaid = 0, commissionOwed = 0, after = 0, afterBase = 0, collected = 0, balance = 0;
  let estGross = 0, withoutActuals = 0;
  for (const { job, c } of rows) {
    revenue += job.contractValue;
    financeCharges += c.financeCharges;
    materials += c.materialsActual;
    labor += job.laborActual ?? 0;
    estGross += c.estGross;
    commissionPaid += job.commissionPaid;
    commissionOwed += Math.max(0, c.commissionOwed);
    collected += c.totalPayments;
    balance += c.balance;
    if (c.grossActual !== null) {
      gross += c.grossActual;
      grossBase += job.contractValue;
      after += c.grossAfterCommission ?? 0;
      afterBase += job.contractValue;
    } else withoutActuals += 1;
  }
  return {
    count: rows.length,
    revenue,
    financeCharges,
    materials,
    labor,
    gross,
    grossBase,
    grossPct: grossBase ? gross / grossBase : null,
    estPct: revenue ? estGross / revenue : null,
    commissionPaid,
    commissionOwed,
    afterCommission: after,
    afterCommissionPct: afterBase ? after / afterBase : null,
    collected,
    balance,
    averageJob: rows.length ? revenue / rows.length : 0,
    withoutActuals,
  };
}

export const yearOf = (iso: string | null): number | null => (iso ? Number(iso.slice(0, 4)) : null);

export function availableYears(jobs: Job[]): number[] {
  const ys = new Set<number>();
  for (const j of jobs) {
    if (j.state === "completed" && j.reportYear) ys.add(j.reportYear);
    const s = yearOf(j.soldDate);
    if (s) ys.add(s);
  }
  return [...ys].sort((a, b) => b - a);
}

export const completedIn = (rows: Row[], year: number) =>
  rows.filter((r) => r.job.state === "completed" && r.job.reportYear === year);

export const bookedIn = (rows: Row[], year: number) => rows.filter((r) => yearOf(r.job.soldDate) === year);

export const openRows = (rows: Row[]) => rows.filter((r) => r.job.state === "open");

/** Month (0-11) a completed job counts in. A mistyped complete date falls back to the final payment date. */
export function completionMonth(job: Job): number | null {
  const pick = [job.completeDate, job.finalDate, job.soldDate].find((d) => d && yearOf(d) === job.reportYear);
  return pick ? Number(pick.slice(5, 7)) - 1 : null;
}

export interface MonthPoint {
  month: number;
  booked: number;
  bookedCount: number;
  completed: number;
  completedCount: number;
  grossPct: number | null;
}

export function monthly(rows: Row[], year: number): MonthPoint[] {
  const pts: MonthPoint[] = Array.from({ length: 12 }, (_, month) => ({
    month, booked: 0, bookedCount: 0, completed: 0, completedCount: 0, grossPct: null,
  }));
  const gp = Array.from({ length: 12 }, () => ({ g: 0, base: 0 }));
  for (const { job, c } of bookedIn(rows, year)) {
    const m = Number(job.soldDate!.slice(5, 7)) - 1;
    pts[m].booked += job.contractValue;
    pts[m].bookedCount += 1;
  }
  for (const { job, c } of completedIn(rows, year)) {
    const m = completionMonth(job);
    if (m === null) continue;
    pts[m].completed += job.contractValue;
    pts[m].completedCount += 1;
    if (c.grossActual !== null) {
      gp[m].g += c.grossActual;
      gp[m].base += job.contractValue;
    }
  }
  pts.forEach((p, i) => (p.grossPct = gp[i].base ? gp[i].g / gp[i].base : null));
  return pts;
}

export interface GroupStat extends Summary {
  key: string;
}

export function groupBy(rows: Row[], keyOf: (r: Row) => string): GroupStat[] {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const k = keyOf(r);
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return [...map.entries()]
    .map(([key, rs]) => ({ key, ...summarize(rs) }))
    .sort((a, b) => b.revenue - a.revenue);
}

export function productGroup(product: string): string {
  const t = product.split("/").filter(Boolean);
  const has = (x: string) => t.includes(x);
  if (t.length === 1 && has("W")) return "Windows";
  if (t.length === 1 && has("PD")) return "Patio doors";
  if (t.length === 1 && has("ED")) return "Entry doors";
  if (has("W") && (has("PD") || has("ED") || has("SD"))) return "Windows and doors";
  if (!has("W") && t.every((x) => x === "PD" || x === "ED" || x === "SD")) return "Doors";
  return "Siding, bath and other";
}

export function pipeline(rows: Row[]) {
  return STAGES.map((s) => {
    const rs = rows.filter((r) => r.job.stage === s.key);
    return { ...s, count: rs.length, value: rs.reduce((a, r) => a + r.job.contractValue, 0) };
  }).concat(
    (() => {
      const rs = rows.filter((r) => !r.job.stage);
      return rs.length
        ? [{ key: "none" as Stage, label: "No stage set", color: "#B8C3C5", count: rs.length, value: rs.reduce((a, r) => a + r.job.contractValue, 0) }]
        : [];
    })(),
  );
}

export interface Attention {
  id: string;
  jobId: string;
  title: string;
  detail: string;
  kind: "numbers" | "money" | "margin" | "data";
  tab: "open" | "completed";
}

export function attention(rows: Row[], settings: Settings, year: number): Attention[] {
  const out: Attention[] = [];
  const open = openRows(rows);
  for (const { job, c } of open) {
    if (c.missing.length)
      out.push({ id: `n-${job.id}`, jobId: job.id, kind: "numbers", tab: "open", title: `${job.name} needs numbers`, detail: `Add ${c.missing.map((m) => (m.startsWith("ProVia") ? m : m.toLowerCase())).join(" and ")}` });
  }
  for (const { job, c } of completedIn(rows, year)) {
    if (c.balance > 1)
      out.push({ id: `b-${job.id}`, jobId: job.id, kind: "money", tab: "completed", title: `${job.name} still owes ${Math.round(c.balance).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 } as Intl.NumberFormatOptions)}`, detail: `Completed ${job.completeDate ?? "(no date)"}` });
    if (c.commissionOwed > 1)
      out.push({ id: `c-${job.id}`, jobId: job.id, kind: "money", tab: "completed", title: `Commission owed on ${job.name}`, detail: `${Math.round(c.commissionOwed).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 } as Intl.NumberFormatOptions)} to ${job.rep}` });
    if (job.laborActual === null)
      out.push({ id: `l-${job.id}`, jobId: job.id, kind: "numbers", tab: "completed", title: `${job.name} has no labor paid`, detail: "Gross profit can't be finished without it" });
    if (job.completeDate && job.soldDate && job.completeDate < job.soldDate)
      out.push({ id: `d-${job.id}`, jobId: job.id, kind: "data", tab: "completed", title: `${job.name} finished before it sold`, detail: `Sold ${job.soldDate}, completed ${job.completeDate}` });
  }
  // open jobs that are sold, deposit-less and old
  for (const { job } of open) {
    const age = daysSince(job.soldDate);
    if (age !== null && age > 120 && job.stage !== "scheduled")
      out.push({ id: `o-${job.id}`, jobId: job.id, kind: "data", tab: "open", title: `${job.name} has been open ${age} days`, detail: "Check where it is in production" });
  }
  return out;
}

export function lowestMargins(rows: Row[], year: number, n = 5) {
  return completedIn(rows, year)
    .filter((r) => r.c.actualPct !== null && r.job.contractValue >= 1500)
    .sort((a, b) => (a.c.actualPct! - b.c.actualPct!))
    .slice(0, n);
}
