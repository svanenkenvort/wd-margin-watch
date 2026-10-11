import { asDate, customerName, foundReps, isComplete, isSold, productCode, repName, salesPersonName, sameCustomer, startStage, type BpProject, type BpProjectDetail } from "./bp-mapping";
import { randomUUID } from "crypto";
import { blankJob, mutate, readStore } from "./store";
import type { BpCandidate, BpReview, BpSnapshot, Job, RepSetting, Settings, StoreData } from "./types";

/**
 * Builder Prime Open API client. Only reads.
 * Base URL: https://{subdomain}.builderprime.com   Auth: x-api-key header (environment variable).
 * Builder Prime allows roughly 80 requests before it answers 429 with a Retry-After of about 40
 * seconds. A sync runs as short steps (see syncStep), so on Vercel no request runs long, and a
 * rate-limit wait is handed back to the screen to count down instead of being slept through.
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

/** Builder Prime said to wait (429). */
export class BpRateLimited extends BpError {
  constructor(public waitMs: number) {
    super(`Builder Prime asked the app to wait ${Math.ceil(waitMs / 1000)} seconds before asking again. Try again then.`, 429);
  }
}

async function bpGet(settings: Settings, path: string, params: Record<string, string> = {}): Promise<unknown> {
  const cfg = bpConfig(settings);
  if (!cfg.hasKey) throw new BpError("No Builder Prime API key found. Add BUILDERPRIME_API_KEY to the environment variables and redeploy.");
  const url = new URL(path, cfg.base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetch(url, { headers: { "x-api-key": cfg.key, Accept: "application/json" }, cache: "no-store" });
  } catch (e) {
    throw new BpError(`Could not reach ${cfg.base}. ${(e as Error).message}`);
  }
  if (res.status === 429) throw new BpRateLimited(((Number(res.headers.get("retry-after")) || 30) + 1) * 1000);
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

function candidate(p: BpProject, c: CacheEntry | undefined, reps: RepSetting[], known: string[], now: string): BpCandidate {
  const rep = repName(p, reps, known);
  const snapshot: BpSnapshot = {
    status: p.projectStatusDescription ?? "",
    projectName: (p.projectName ?? "").trim(),
    projectType: (p.projectTypeDescription ?? "").trim(),
    contracted: c?.contracted ?? null,
    invoiced: c?.invoiced ?? null,
    paid: c?.paid ?? null,
    cost: num(p.materialCost),
    salesPerson: salesPersonName(p),
    rep,
    complete: isComplete(p),
    completedOn: isComplete(p) ? asDate(p.completionDateTime) : null,
    syncedAt: now,
  };
  return {
    projectId: String(p.id),
    bpJobNumber: p.companySequenceNumber != null ? String(p.companySequenceNumber) : "",
    name: customerName(p),
    rep,
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
 * The sales rep: an empty rep is filled in and an open job takes Builder Prime's sales person (a rep
 * in Settings by now, see foundReps); a completed job keeps its rep and shows the difference.
 */
function refresh(job: Job, c: BpCandidate, reps: RepSetting[], changes: string[]): boolean {
  let changed = false;
  job.bp = c.snapshot;
  if (c.bpJobNumber && job.builderPrimeJobNumber !== c.bpJobNumber) job.builderPrimeJobNumber = c.bpJobNumber;
  if (c.rep && job.rep !== c.rep && (!job.rep || (job.state === "open" && reps.some((r) => r.name === c.rep)))) {
    changes.push(`${job.name}: sales rep ${job.rep || "(none)"} → ${c.rep} (${c.snapshot.salesPerson} in Builder Prime)`);
    job.rep = c.rep;
    changed = true;
  }
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
  const cands = new Map(order.map((p) => [String(p.id), candidate(p, cache[String(p.id)], d.settings.reps, known, now)]));
  const isNewSale = (p: BpProject) => !!seen && !seen.has(String(p.id));
  const same = (j: Job, v: number | null) => v !== null && Math.abs(j.contractValue - v) < 0.01;
  // Every rep on a job and every Builder Prime sales person is a rep in Settings (linked to their
  // Builder Prime name), so each can be given a commission rate.
  d.settings.reps = foundReps(d.settings.reps, d.jobs.map((j) => j.rep), [...cands.values()].map((c) => c.snapshot));

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
      if (refresh(job, c, d.settings.reps, report.changes)) report.updated++;
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

/** The fields the sync keeps between steps (the full records are much larger). */
function slim(p: BpProject): BpProject {
  return {
    id: p.id, companySequenceNumber: p.companySequenceNumber, projectName: p.projectName, clientFirstName: p.clientFirstName,
    clientLastName: p.clientLastName, clientCompanyName: p.clientCompanyName, salesPersonFirstName: p.salesPersonFirstName,
    salesPersonLastName: p.salesPersonLastName, projectTypeDescription: p.projectTypeDescription, projectStatusDescription: p.projectStatusDescription,
    projectStatusCategoryDescription: p.projectStatusCategoryDescription, projectStatusIsCancelled: p.projectStatusIsCancelled,
    materialCost: p.materialCost, createdDate: p.createdDate, lastModifiedDate: p.lastModifiedDate, completionDateTime: p.completionDateTime,
  };
}

/** Work per step, well inside Vercel's time limit for a request. */
const STEP_MS = 25_000;
/** A step holds the sync this long, so two people pressing Sync don't read the same projects twice. */
const LEASE_MS = 45_000;
/** An unfinished sync older than this starts over (the project list may have changed). */
const STALE_MS = 60 * 60_000;

export type SyncStep =
  | { status: "working" | "wait" | "busy"; step: "list" | "details"; done: number; total: number; waitMs: number }
  | { status: "done"; report: SyncReport };

type Session = NonNullable<StoreData["bpSync"]>;

/**
 * One step of a sync. The screen calls this until it says "done":
 * - the first step reads the project list and works out which projects need their details read;
 * - each step then reads details for about 25 seconds and saves them;
 * - "wait": Builder Prime's rate limit; call again after waitMs (progress so far is saved);
 * - "busy": someone else's step is running; call again after waitMs;
 * - the last step places every project (links, new open jobs, review list) and saves.
 * Closing the page mid-sync loses nothing: the next sync carries on where this one stopped.
 */
export async function syncStep(settings: Settings): Promise<SyncStep> {
  const t0 = Date.now();
  const fresh = (d: StoreData) => (d.bpSync && Date.now() - d.bpSync.startedAt <= STALE_MS ? d.bpSync : null);

  const before = await readStore();
  const current = fresh(before);
  if (current?.leaseUntil && current.leaseUntil > t0)
    return { status: "busy", step: "details", done: current.next, total: current.toRead.length, waitMs: current.leaseUntil - t0 };
  let started: Session | null = null;
  if (!current) {
    let projects: BpProject[];
    try {
      projects = await fetchProjects(settings);
    } catch (e) {
      if (e instanceof BpRateLimited) return { status: "wait", step: "list", done: 0, total: 0, waitMs: e.waitMs };
      throw e;
    }
    const sold = projects.filter(isSold).map(slim);
    const linked = new Map(before.jobs.filter((j) => j.builderPrimeId).map((j) => [j.builderPrimeId!, j]));
    const toRead = sold.filter((p) => needsDetail(p, before.bpCache?.[String(p.id)], linked.get(String(p.id)))).map((p) => String(p.id));
    started = { startedAt: t0, fetched: projects.length, sold, toRead, next: 0, detailsRead: 0, leaseUntil: null, leaseId: null };
  }

  // Take the sync for this step.
  const leaseId = randomUUID();
  const claim = await mutate((d): { busy: number } | { session: Session } | null => {
    const cur = fresh(d);
    if (cur?.leaseUntil && cur.leaseUntil > Date.now()) return { busy: cur.leaseUntil - Date.now() };
    const session = cur ?? started;
    if (!session) return null;
    d.bpSync = { ...session, leaseUntil: Date.now() + LEASE_MS, leaseId };
    return { session: d.bpSync };
  });
  if (!claim) return { status: "working", step: "list", done: 0, total: 0, waitMs: 0 };
  if ("busy" in claim) return { status: "busy", step: "details", done: 0, total: 0, waitMs: claim.busy };
  const session = claim.session;

  // Read details until the step's time is up, Builder Prime says wait, or all are read.
  const got: Cache = {};
  const byId = new Map(session.sold.map((p) => [String(p.id), p]));
  let next = session.next;
  let waitMs = 0;
  try {
    while (next < session.toRead.length && Date.now() - t0 < STEP_MS) {
      const id = session.toRead[next];
      const detail = await fetchDetail(settings, id);
      got[id] = {
        modified: byId.get(id)?.lastModifiedDate ?? null,
        contracted: num(detail.totalContractedAmount),
        invoiced: num(detail.totalInvoicedAmount),
        paid: num(detail.totalPaidAmount),
      };
      next++;
    }
  } catch (e) {
    if (!(e instanceof BpRateLimited)) {
      await mutate((d) => {
        d.bpCache = { ...(d.bpCache ?? {}), ...got };
        if (d.bpSync?.leaseId === leaseId) d.bpSync = { ...d.bpSync, next, leaseUntil: null, leaseId: null };
      });
      throw e;
    }
    waitMs = e.waitMs;
  }

  // Save what was read; on the last step, place every project.
  const result = await mutate((d): { report: SyncReport } | { done: number; total: number } | null => {
    d.bpCache = { ...(d.bpCache ?? {}), ...got };
    const cur = d.bpSync;
    if (!cur || cur.leaseId !== leaseId) return null;
    const read = cur.detailsRead + Object.keys(got).length;
    if (next < cur.toRead.length) {
      d.bpSync = { ...cur, next, detailsRead: read, leaseUntil: null, leaseId: null };
      return { done: next, total: cur.toRead.length };
    }
    const report: SyncReport = { firstSync: false, fetched: cur.fetched, sold: cur.sold.length, detailsRead: read, created: 0, linked: 0, updated: 0, changes: [], review: { notInApp: 0, maybe: 0 } };
    place(d, cur.sold, d.bpCache, report);
    d.bpSync = null;
    return { report };
  });
  if (!result) return { status: "working", step: "details", done: next, total: session.toRead.length, waitMs: 0 };
  if ("report" in result) return { status: "done", report: result.report };
  return { status: waitMs ? "wait" : "working", step: "details", done: result.done, total: result.total, waitMs };
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
    refresh(job, c, d.settings.reps, []);
    drop(a.projectId);
    return { linked: 1 };
  });
}
