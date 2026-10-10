/**
 * Builder Prime project records, as GET /api/projects/v1 returns them (checked against the live
 * API on 2026-10-10). The records are flat: there is no scope, price line, contract amount, sold
 * date or payment on them, and no other Open API endpoint has them either. So the ProVia Order #
 * (the job number), contract value and payments are typed in the app; Builder Prime supplies who,
 * which rep, its own job # and when the project turned sold.
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
  lastModifiedDate: number | null;
}

/** Status categories that mean the project is sold (Sold, Deposit Received, Scheduled, Complete). */
const SOLD_CATEGORIES = new Set(["PRE_PRODUCTION", "PRODUCTION", "POST_PRODUCTION"]);

export const isSold = (p: BpProject) => SOLD_CATEGORIES.has(p.projectStatusCategoryDescription ?? "") && !p.projectStatusIsCancelled;

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

/**
 * The rep the way the app already writes them: "SHAUN V" for Shaun Van Enkenvort if that is in
 * use, otherwise "SHAUN" if that is, otherwise first name and last initial.
 */
export function repName(p: BpProject, known: string[]): string {
  const first = clean(p.salesPersonFirstName).toUpperCase();
  const last = clean(p.salesPersonLastName).toUpperCase();
  if (!first) return "";
  const withInitial = last ? `${first} ${last[0]}` : first;
  return [withInitial, first].find((n) => known.includes(n)) ?? withInitial;
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
