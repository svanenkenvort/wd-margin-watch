import type { BpSnapshot, RepSetting, Stage } from "./types";

/**
 * Builder Prime project records (checked against the live API on 2026-10-10).
 * The list (GET /api/projects/v1) has who, rep, status, Builder Prime's job # and cost. Only the
 * single project (GET /api/projects/v1/{id}) adds the money: contracted, invoiced and paid totals.
 * Nothing in the Open API has the ProVia Order #, the sale date, discounts, the payment split or
 * labor, so those are typed in the app.
 */
export interface BpProject {
  id: number | string;
  /** Builder Prime's own job # ("Job #1950" in Builder Prime). Not the app's job number. */
  companySequenceNumber: number | null;
  projectName: string | null;
  clientFirstName: string | null;
  clientLastName: string | null;
  clientCompanyName: string | null;
  salesPersonFirstName: string | null;
  salesPersonLastName: string | null;
  projectTypeDescription: string | null;
  projectStatusDescription: string | null;
  /** SALES, PRE_PRODUCTION, PRODUCTION, POST_PRODUCTION or LOST_CANCELED */
  projectStatusCategoryDescription: string | null;
  projectStatusIsCancelled: boolean | null;
  materialCost: number | null;
  createdDate: number | null;
  lastModifiedDate: number | null;
  completionDateTime: number | null;
}

/** Only on the single-project response. */
export interface BpProjectDetail extends BpProject {
  /** Contract total after discounts: the Sold Contracts report's "Sale Amount". */
  totalContractedAmount?: number | null;
  totalInvoicedAmount?: number | null;
  totalPaidAmount?: number | null;
}

/** Status categories that mean the project is sold (Sold, Deposit Received, Scheduled, Complete). */
const SOLD_CATEGORIES = new Set(["PRE_PRODUCTION", "PRODUCTION", "POST_PRODUCTION"]);

export const isSold = (p: BpProject) => SOLD_CATEGORIES.has(p.projectStatusCategoryDescription ?? "") && !p.projectStatusIsCancelled;
export const isComplete = (p: BpProject) => p.projectStatusCategoryDescription === "POST_PRODUCTION";

/** Builder Prime project types that map to one product code without guessing. Others are left for you. */
const PRODUCTS: Record<string, string> = {
  "Replacement Windows": "W",
  "Sliding Glass Door": "PD",
  "Entry Doors": "ED",
};
export const productCode = (p: BpProject) => PRODUCTS[(p.projectTypeDescription ?? "").trim()] ?? "";

/** Where a newly sold job starts on the Open jobs board. */
export function startStage(p: BpProject, paid: number): Stage {
  const status = (p.projectStatusDescription ?? "").toLowerCase();
  if (isComplete(p)) return "completedAwaitingPay";
  if (status.includes("scheduled")) return "scheduled";
  return paid > 0 || status.includes("deposit") ? "needsMeasure" : "awaitingDeposit";
}

/** Epoch milliseconds (what Builder Prime sends) or an ISO string, as yyyy-mm-dd in local time. */
export function asDate(v: unknown): string | null {
  const d = typeof v === "number" ? new Date(v) : typeof v === "string" ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const clean = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();

/** The customer name the way the spreadsheet has it: last name, upper case. */
export function customerName(p: BpProject): string {
  return (clean(p.clientLastName) || clean(p.clientCompanyName) || clean(p.projectName)).toUpperCase();
}

/** The project's sales person as Builder Prime writes them, e.g. "Mike Schmitz". */
export function salesPersonName(p: BpProject): string {
  return [clean(p.salesPersonFirstName), clean(p.salesPersonLastName)].filter(Boolean).join(" ");
}

const sameName = (a: string | undefined, b: string) => !!a && clean(a).toUpperCase() === clean(b).toUpperCase();

/** The rep set up in Settings with this Builder Prime name, if any. */
export function linkedRep(salesPerson: string, reps: RepSetting[]): RepSetting | undefined {
  return salesPerson ? reps.find((r) => sameName(r.builderPrimeName, salesPerson)) : undefined;
}

/**
 * The app rep for a Builder Prime sales person:
 * 1. the rep whose Builder Prime name (Settings > Sales reps) is this person;
 * 2. otherwise a rep name already in use that fits: "SHAUN V" or "SHAUN" for Shaun Van Enkenvort,
 *    "SCHMITZ" for Mike Schmitz (a rep linked to someone else in Builder Prime is never picked);
 * 3. otherwise first name and last initial.
 */
export function repName(p: BpProject, reps: RepSetting[], known: string[]): string {
  const full = salesPersonName(p);
  const linked = linkedRep(full, reps);
  if (linked) return linked.name;
  const first = clean(p.salesPersonFirstName).toUpperCase();
  const last = clean(p.salesPersonLastName).toUpperCase();
  if (!first && !last) return "";
  const taken = new Set(reps.filter((r) => r.builderPrimeName && !sameName(r.builderPrimeName, full)).map((r) => r.name));
  const withInitial = first && last ? `${first} ${last[0]}` : first || last;
  const options = [withInitial, first, last, `${first} ${last}`.trim()].filter(Boolean);
  return options.find((n) => known.includes(n) && !taken.has(n)) ?? withInitial;
}

/**
 * Every rep in use, so each can be given a commission rate: the reps in Settings, plus any rep on a
 * job or matched to a Builder Prime sales person that isn't there yet (at 0%, flagged as needing a
 * rate). A rep with no Builder Prime name takes the one sales person the sync matched to them.
 */
export function foundReps(reps: RepSetting[], jobReps: string[], snapshots: (BpSnapshot | null | undefined)[]): RepSetting[] {
  const out = reps.map((r) => ({ ...r }));
  const add = (name: string) => {
    if (name && !out.some((r) => r.name === name)) out.push({ name, commissionRate: 0, needsRate: true });
  };
  jobReps.forEach(add);
  const people = new Map<string, Set<string>>();
  for (const s of snapshots) {
    if (!s?.salesPerson || !s.rep || linkedRep(s.salesPerson, out)) continue;
    add(s.rep);
    people.set(s.rep, (people.get(s.rep) ?? new Set()).add(clean(s.salesPerson)));
  }
  for (const r of out) {
    const names = people.get(r.name);
    if (!r.builderPrimeName && names?.size === 1) r.builderPrimeName = [...names][0];
  }
  return out;
}

/**
 * True when an app job's name is this customer: "VAN LAANEN", "VANLAANEN" or "VAN LAANEN #2" all
 * match Van Laanen, but "LANGE" does not match Lang.
 */
export function sameCustomer(appName: string, p: BpProject): boolean {
  const target = customerName(p).replace(/[^A-Z]/g, "");
  if (!target) return false;
  const words = appName.toUpperCase().split(/[^A-Z]+/).filter(Boolean);
  let joined = "";
  for (const w of words) {
    joined += w;
    if (joined === target) return true;
    if (joined.length >= target.length) return false;
  }
  return false;
}
