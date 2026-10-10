import { asDate, customerName, isSold, repName, sameCustomer, type BpProject } from "./bp-mapping";
import { blankJob, mutate } from "./store";
import type { Job, Settings, StoreData } from "./types";

/**
 * Builder Prime Open API client.
 * Base URL: https://{subdomain}.builderprime.com   Auth: x-api-key header (set in .env.local).
 * Only reads. Sync brings in new sales and never changes a job already in the app.
 */
export function bpConfig(settings: Settings) {
  const key = process.env.BUILDERPRIME_API_KEY ?? "";
  const subdomain = process.env.BUILDERPRIME_SUBDOMAIN || settings.builderPrime.subdomain;
  return { key, subdomain, base: `https://${subdomain}.builderprime.com`, hasKey: key.length > 0 };
}

export class BpError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

async function bpGet(settings: Settings, path: string, params: Record<string, string> = {}): Promise<unknown> {
  const cfg = bpConfig(settings);
  if (!cfg.hasKey) throw new BpError("No API key found. Add BUILDERPRIME_API_KEY to .env.local and restart the app.");
  const url = new URL(path, cfg.base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetch(url, { headers: { "x-api-key": cfg.key, Accept: "application/json" }, cache: "no-store" });
  } catch (e) {
    throw new BpError(`Could not reach ${cfg.base}. ${(e as Error).message}`);
  }
  if (res.status === 401 || res.status === 403)
    throw new BpError("Builder Prime rejected the API key. Check the key and that it has permission to read projects.", res.status);
  if (!res.ok) throw new BpError(`Builder Prime answered ${res.status} ${res.statusText}.`, res.status);
  return res.json();
}

/** Every project. Builder Prime pages from page=0 with at most limit=100, and needs both. */
export async function fetchProjects(settings: Settings): Promise<BpProject[]> {
  const out: BpProject[] = [];
  for (let page = 0; page < 200; page++) {
    const body = (await bpGet(settings, "/api/projects/v1", { page: String(page), limit: "100" })) as { data?: unknown };
    const rows = Array.isArray(body?.data) ? (body.data as BpProject[]) : [];
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out;
}

export interface NewProject {
  builderPrimeId: string;
  bpJobNumber: string;
  name: string;
  rep: string;
  /** Builder Prime has no sold date; this is its last change to the project, which is on or after the sale. */
  soldDate: string | null;
  status: string;
  projectName: string;
  projectType: string;
  materialCost: number | null;
}

function describe(p: BpProject, known: string[]): NewProject {
  return {
    builderPrimeId: String(p.id),
    bpJobNumber: p.companySequenceNumber != null ? String(p.companySequenceNumber) : "",
    name: customerName(p),
    rep: repName(p, known),
    soldDate: asDate(p.lastModifiedDate),
    status: p.projectStatusDescription ?? "",
    projectName: (p.projectName ?? "").trim(),
    projectType: (p.projectTypeDescription ?? "").trim(),
    materialCost: typeof p.materialCost === "number" ? p.materialCost : null,
  };
}

export interface SyncPlan {
  /** First sync: every project sold so far is taken as already in the app, and nothing is added. */
  firstSync: boolean;
  fetched: number;
  sold: number;
  toAdd: NewProject[];
  /** First sync only: open sold projects with no job of that customer's name in the app. */
  notFoundInApp: NewProject[];
}

/**
 * Which projects are new sales. Builder Prime has no ProVia Order # to match jobs on, so the app
 * remembers which projects it has seen sold; a project that turns sold after that is new.
 */
function plan(projects: BpProject[], data: StoreData): SyncPlan {
  const known = [...new Set([...data.settings.reps.map((r) => r.name), ...data.jobs.map((j) => j.rep)])].filter(Boolean);
  const sold = projects.filter(isSold);
  const seen = data.bpSoldSeen ? new Set(data.bpSoldSeen) : null;
  const linked = new Set(data.jobs.map((j) => j.builderPrimeId).filter(Boolean));
  if (!seen) {
    const open = sold.filter((p) => p.projectStatusCategoryDescription !== "POST_PRODUCTION");
    return {
      firstSync: true,
      fetched: projects.length,
      sold: sold.length,
      toAdd: [],
      notFoundInApp: open.filter((p) => !data.jobs.some((j) => sameCustomer(j.name, p))).map((p) => describe(p, known)),
    };
  }
  return {
    firstSync: false,
    fetched: projects.length,
    sold: sold.length,
    toAdd: sold.filter((p) => !seen.has(String(p.id)) && !linked.has(String(p.id))).map((p) => describe(p, known)),
    notFoundInApp: [],
  };
}

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function toJob(n: NewProject): Job {
  const from = [n.projectName, n.projectType].filter(Boolean).join(", ");
  return blankJob({
    builderPrimeId: n.builderPrimeId,
    builderPrimeJobNumber: n.bpJobNumber || null,
    jobNumber: "",
    name: n.name || "NEW JOB",
    rep: n.rep,
    soldDate: n.soldDate,
    stage: "awaitingDeposit",
    notes: `Builder Prime job #${n.bpJobNumber}${from ? `: ${from}` : ""}.${n.materialCost ? ` Builder Prime cost ${money(n.materialCost)}.` : ""}`,
    source: "builderprime",
  });
}

/** What a sync would do, without saving anything. */
export async function testConnection(settings: Settings, data: StoreData) {
  const cfg = bpConfig(settings);
  const projects = await fetchProjects(settings);
  return { base: cfg.base, ...plan(projects, data) };
}

export interface SyncReport extends SyncPlan {
  created: number;
}

/**
 * Adds new sales from Builder Prime as open jobs. Jobs already in the app are never changed.
 * New jobs still need their ProVia Order #, contract value and the other numbers typed in.
 */
export async function syncProjects(settings: Settings): Promise<SyncReport> {
  const projects = await fetchProjects(settings);
  return mutate((d) => {
    const p = plan(projects, d);
    for (const n of p.toAdd) d.jobs.push(toJob(n));
    d.bpSoldSeen = [...new Set([...(d.bpSoldSeen ?? []), ...projects.filter(isSold).map((x) => String(x.id))])];
    d.settings.builderPrime.lastSync = new Date().toISOString();
    return { ...p, created: p.toAdd.length };
  });
}
