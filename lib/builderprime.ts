import { asDate, customerName, isComplete, isSold, productCode, repName, sameCustomer, startStage, type BpProject, type BpProjectDetail } from "./bp-mapping";
import { blankJob, mutate, readStore } from "./store";
import type { BpCandidate, BpReview, BpSnapshot, Job, Settings, StoreData } from "./types";

/**
 * Builder Prime Open API client. Only reads.
 * Base URL: https://{subdomain}.builderprime.com   Auth: x-api-key header (set in .env.local).
 * Builder Prime allows roughly 80 requests before it answers 429 with a Retry-After of about 40
 * seconds, so requests go one at a time and wait when told to.
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function bpGet(settings: Settings, path: string, params: Record<string, string> = {}): Promise<unknown> {
  const cfg = bpConfig(settings);
  if (!cfg.hasKey) throw new BpError("No API key found. Add BUILDERPRIME_API_KEY to .env.local and restart the app.");
  const url = new URL(path, cfg.base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { headers: { "x-api-key": cfg.key, Accept: "application/json" }, cache: "no-store" });
    } catch (e) {
      throw new BpError(`Could not reach ${cfg.base}. ${(e as Error).message}`);
    }
    if (res.status === 429 && attempt < 8) {
      const wait = Math.min(Number(res.headers.get("retry-after")) || 30, 120);
      await sleep((wait + 1) * 1000);
      continue;
    }
    if (res.status === 401 || res.status === 403)
      throw new BpError("Builder Prime rejected the API key. Check the key and that it has permission to read projects.", res.status);
    if (res.status === 429) throw new BpError("Builder Prime is limiting requests right now. Try the sync again in a few minutes.", 429);
    if (!res.ok) throw new BpError(`Builder Prime answered ${res.status} ${res.statusText}.`, res.status);
    return res.json();
  }
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

async function fetchDetail(settings: Settings, id: string | number): Promise<BpProjectDetail> {
  const body = (await bpGet(settings, `/api/projects/v1/${encodeURIComponent(String(id))}`)) as { data?: BpProjectDetail };
  if (!body?.data) throw new BpError(`Builder Prime returned no detail for project ${id}.`);
  return body.data;
}

type Cache = NonNullable<StoreData["bpCache"]>;
type CacheEntry = Cache[string];

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const owes = (c: CacheEntry | undefined) => !!c && c.contracted !== null && (c.paid ?? 0) < c.contracted - 0.5;

/**
 * The money is only on the single-project call, so each sync reads it for projects that are new
 * or changed, linked to an open job, or still owe money; everything else comes from the cache.
 */
function needsDetail(p: BpProject, cached: CacheEntry | undefined, job: Job | undefined): boolean {
  if (!cached || cached.modified !== (p.lastModifiedDate ?? null)) return true;
  if (job?.state === "open") return true;
  return !!job && owes(cached);
}

function candidate(p: BpProject, c: CacheEntry | undefined, known: string[], now: string): BpCandidate {
  const snapshot: BpSnapshot = {
    status: p.projectStatusDescription ?? "",
    projectName: (p.projectName ?? "").trim(),
    projectType: (p.projectTypeDescription ?? "").trim(),
    contracted: c?.contracted ?? null,
    invoiced: c?.invoiced ?? null,
    paid: c?.paid ?? null,
    cost: num(p.materialCost),
    complete: isComplete(p),
    completedOn: isComplete(p) ? asDate(p.completionDateTime) : null,
    syncedAt: now,
  };
  return {
    projectId: String(p.id),
    bpJobNumber: p.companySequenceNumber != null ? String(p.companySequenceNumber) : "",
    name: customerName(p),
    rep: repName(p, known),
    product: productCode(p),
    stage: startStage(p, snapshot.paid ?? 0),
    snapshot,
  };
}

/** A new open job. Sold date, ProVia Order #, labor and finance are left for you. */
function newJob(c: BpCandidate): Job {
  const s = c.snapshot;
  return blankJob({
    builderPrimeId: c.projectId,
    builderPrimeJobNumber: c.bpJobNumber || null,
    name: c.name || "NEW JOB",
    rep: c.rep,
    product: c.product,
    stage: c.stage,
    contractValue: s.contracted ?? 0,
    depositAmount: s.paid ?? 0,
    materialsEst: s.cost && s.cost > 0 ? s.cost : null,
    bp: s,
    source: "builderprime",
  });
}

/**
 * Puts Builder Prime's figures on a linked job. Open jobs take Builder Prime's contract value and
 * fill an empty materials estimate or product; completed jobs keep their numbers. Payments you
 * entered are never changed (the job shows if they differ from Builder Prime).
 */
function refresh(job: Job, c: BpCandidate, changes: string[]): boolean {
  let changed = false;
  job.bp = c.snapshot;
  if (c.bpJobNumber && job.builderPrimeJobNumber !== c.bpJobNumber) job.builderPrimeJobNumber = c.bpJobNumber;
  if (job.state === "open") {
    const s = c.snapshot;
    if (s.contracted && Math.abs(s.contracted - job.contractValue) >= 0.01) {
      changes.push(`${job.name}: contract value ${job.contractValue.toFixed(2)} → ${s.contracted.toFixed(2)}`);
      job.contractValue = s.contracted;
      changed = true;
    }
    if (job.materialsEst === null && s.cost && s.cost > 0) {
      job.materialsEst = s.cost;
      changed = true;
    }
    if (!job.product && c.product) {
      job.product = c.product;
      changed = true;
    }
  }
  job.updatedAt = new Date().toISOString();
  return changed;
}

export interface SyncReport {
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

/**
 * Places every sold project:
 * 1. same customer name and contract value as exactly one unlinked job that could be it (see
 *    couldBe: a returning customer's new purchase never lands on their earlier job): link them;
 * 2. linked to a job: refresh Builder Prime's figures on it;
 * 3. sold since the last sync: add it as an open job (or ask, if an open job might already be it);
 * 4. otherwise, if it is still open: list it for review (add, link or leave out).
 * The first sync takes every project already sold as already in the app (the spreadsheet), so it
 * only links and lists; from then on new sales come in by themselves.
 */
function place(d: StoreData, sold: BpProject[], cache: Cache, report: SyncReport) {
  const now = new Date().toISOString();
  const seen = d.bpSoldSeen ? new Set(d.bpSoldSeen) : null;
  const ignored = new Set(d.bpIgnored ?? []);
  const known = [...new Set([...d.settings.reps.map((r) => r.name), ...d.jobs.map((j) => j.rep)])].filter(Boolean);
  const review: BpReview = { at: now, notInApp: [], maybe: [] };
  report.firstSync = !seen;

  // Newest first: with the sold-date check, a returning customer's newest project can only match
  // their newest job, which leaves the earlier job for the earlier project.
  const order = [...sold].sort((a, b) => (b.companySequenceNumber ?? 0) - (a.companySequenceNumber ?? 0));
  const cands = new Map(order.map((p) => [String(p.id), candidate(p, cache[String(p.id)], known, now)]));
  const isNewSale = (p: BpProject) => !!seen && !seen.has(String(p.id));
  const same = (j: Job, v: number | null) => v !== null && Math.abs(j.contractValue - v) < 0.01;

  // Pass 1: link every project that has exactly one job it could be, at the same contract value.
  for (const p of order) {
    const id = String(p.id);
    if (d.jobs.some((j) => j.builderPrimeId === id)) continue;
    const exact = d.jobs.filter((j) => couldBe(j, p, isNewSale(p)) && same(j, cands.get(id)!.snapshot.contracted));
    if (exact.length === 1) {
      exact[0].builderPrimeId = id;
      report.linked++;
    }
  }

  // Pass 2: refresh linked jobs; add new sales; list the rest for review.
  for (const p of order) {
    const id = String(p.id);
    const c = cands.get(id)!;
    const job = d.jobs.find((j) => j.builderPrimeId === id);
    if (job) {
      if (refresh(job, c, report.changes)) report.updated++;
      continue;
    }
    if (ignored.has(id)) continue;
    // Any unlinked job of this customer, whatever its date: shown for you to decide, so a job whose
    // sold date was mistyped is never added a second time.
    const sameName = d.jobs.filter((j) => !j.builderPrimeId && sameCustomer(j.name, p));
    const toReview = {
      project: c,
      createdOn: asDate(p.createdDate),
      jobs: sameName.map((j) => ({ id: j.id, name: j.name, jobNumber: j.jobNumber, contractValue: j.contractValue, soldDate: j.soldDate, state: j.state })),
    };
    if (isNewSale(p)) {
      // A returning customer's earlier jobs don't stop a new sale; an open job at the same price that
      // couldn't be confirmed (sold date doesn't fit) might be this sale typed in by hand, so ask.
      if (sameName.some((j) => j.state === "open" && same(j, c.snapshot.contracted))) review.maybe.push(toReview);
      else {
        d.jobs.push(newJob(c));
        report.created++;
      }
      continue;
    }
    if (isComplete(p)) continue;
    if (sameName.length) review.maybe.push(toReview);
    else review.notInApp.push(c);
  }

  d.bpSoldSeen = [...new Set([...(d.bpSoldSeen ?? []), ...sold.map((p) => String(p.id))])];
  d.bpCache = cache;
  d.bpReview = review;
  d.settings.builderPrime.lastSync = now;
  report.review = { notInApp: review.notInApp.length, maybe: review.maybe.length };
}

/** yyyy-mm-dd, `days` earlier. */
function daysBefore(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - days);
  return asDate(d.getTime())!;
}

/**
 * Could this app job be this Builder Prime project? Same customer, not linked to another project,
 * and not sold before the project existed in Builder Prime (a week's slack for typing errors).
 * That date check is what keeps a returning customer's new purchase off their earlier job.
 * A brand-new sale only ever matches an open job typed in by hand, never a completed one.
 */
function couldBe(j: Job, p: BpProject, isNewSale: boolean): boolean {
  if (j.builderPrimeId || !sameCustomer(j.name, p)) return false;
  if (isNewSale && j.state !== "open") return false;
  const created = asDate(p.createdDate);
  return !created || !j.soldDate || j.soldDate >= daysBefore(created, 7);
}

let running = false;

export async function syncProjects(settings: Settings): Promise<SyncReport> {
  if (running) throw new BpError("A Builder Prime sync is already running. It can take a few minutes the first time.", 409);
  running = true;
  try {
    const projects = await fetchProjects(settings);
    const sold = projects.filter(isSold);
    const before = await readStore();
    const cache: Cache = { ...(before.bpCache ?? {}) };
    const linked = new Map(before.jobs.filter((j) => j.builderPrimeId).map((j) => [j.builderPrimeId!, j]));
    const report: SyncReport = { firstSync: false, fetched: projects.length, sold: sold.length, detailsRead: 0, created: 0, linked: 0, updated: 0, changes: [], review: { notInApp: 0, maybe: 0 } };
    for (const p of sold) {
      const id = String(p.id);
      if (!needsDetail(p, cache[id], linked.get(id))) continue;
      const detail = await fetchDetail(settings, id);
      cache[id] = {
        modified: p.lastModifiedDate ?? null,
        contracted: num(detail.totalContractedAmount),
        invoiced: num(detail.totalInvoicedAmount),
        paid: num(detail.totalPaidAmount),
      };
      report.detailsRead++;
    }
    await mutate((d) => place(d, sold, cache, report));
    return report;
  } finally {
    running = false;
  }
}

/** Reads the project list only (a few requests) and says what a sync would do. Saves nothing. */
export async function testConnection(settings: Settings, data: StoreData) {
  const cfg = bpConfig(settings);
  const projects = await fetchProjects(settings);
  const sold = projects.filter(isSold);
  const linked = new Map(data.jobs.filter((j) => j.builderPrimeId).map((j) => [j.builderPrimeId!, j]));
  const toRead = sold.filter((p) => needsDetail(p, data.bpCache?.[String(p.id)], linked.get(String(p.id)))).length;
  return {
    base: cfg.base,
    projects: projects.length,
    sold: sold.length,
    linked: sold.filter((p) => linked.has(String(p.id))).length,
    firstSync: !data.bpSoldSeen,
    toRead,
    /** About 80 reads, then a ~40 second wait. */
    minutes: Math.max(1, Math.ceil(toRead / 80)),
  };
}

/* ---------- review: what the sync could not place by itself ---------- */

export type ReviewAction = { action: "add"; projectId: string } | { action: "addAll" } | { action: "link"; projectId: string; jobId: string } | { action: "ignore"; projectId: string };

export function applyReview(a: ReviewAction) {
  return mutate((d) => {
    const r = d.bpReview;
    if (!r) throw new BpError("Nothing to review. Run a sync first.", 404);
    const find = (id: string) => r.notInApp.find((c) => c.projectId === id) ?? r.maybe.find((m) => m.project.projectId === id)?.project;
    const drop = (id: string) => {
      r.notInApp = r.notInApp.filter((c) => c.projectId !== id);
      r.maybe = r.maybe.filter((m) => m.project.projectId !== id);
    };
    const taken = (id: string) => d.jobs.some((j) => j.builderPrimeId === id);

    if (a.action === "addAll") {
      let n = 0;
      for (const c of [...r.notInApp]) {
        if (!taken(c.projectId)) {
          d.jobs.push(newJob(c));
          n++;
        }
        drop(c.projectId);
      }
      return { added: n };
    }
    const c = find(a.projectId);
    if (!c) throw new BpError("That project is no longer waiting for review.", 404);
    if (a.action === "ignore") {
      d.bpIgnored = [...new Set([...(d.bpIgnored ?? []), a.projectId])];
      drop(a.projectId);
      return { ignored: 1 };
    }
    if (taken(a.projectId)) {
      drop(a.projectId);
      return { added: 0 };
    }
    if (a.action === "add") {
      d.jobs.push(newJob(c));
      drop(a.projectId);
      return { added: 1 };
    }
    const job = d.jobs.find((j) => j.id === a.jobId);
    if (!job) throw new BpError("That job no longer exists.", 404);
    if (job.builderPrimeId) throw new BpError(`${job.name} is already linked to Builder Prime job #${job.builderPrimeJobNumber ?? "?"}.`, 409);
    job.builderPrimeId = c.projectId;
    refresh(job, c, []);
    drop(a.projectId);
    return { linked: 1 };
  });
}
