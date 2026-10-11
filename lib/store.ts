import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { neon } from "@neondatabase/serverless";
import type { Job, Settings, StoreData } from "./types";

/**
 * Storage layer. Everything the app saves goes through readStore and mutate.
 * - On Vercel (or whenever DATABASE_URL is set): one row in Postgres (Neon), table
 *   margin_watch_store, holding the whole data set as JSON. Saves use a version number, so two
 *   people saving at once can't overwrite each other: the later save is redone on the newer data.
 * - Otherwise (local development): a JSON file at data/store.json.
 */
const FILE = process.env.DATA_FILE ?? path.join(process.cwd(), "data", "store.json");
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

const EDITABLE: (keyof Job)[] = [
  "jobNumber", "name", "product", "rep", "soldDate", "stage", "completeDate", "reportYear",
  "contractValue", "financePct", "financed", "depositAmount", "depositDate", "stageAmount",
  "stageDate", "finalAmount", "finalDate", "materialsPaid", "materialsEst", "laborEst",
  "laborActual", "commissionRate", "commissionPaid", "commissionPaidDate", "materialsActual", "notes",
];

const DEFAULT_SETTINGS: Settings = {
  targetMargin: 0.5,
  materialsAllowance: 0.03,
  reps: [],
  builderPrime: { subdomain: "windowdepotnew", lastSync: null },
};

const empty = (): StoreData => ({ version: 1, settings: DEFAULT_SETTINGS, jobs: [] });
const withDefaults = (data: StoreData): StoreData => ({ ...data, settings: { ...DEFAULT_SETTINGS, ...data.settings } });

/* ---------- Postgres ---------- */

const sql = DB_URL ? neon(DB_URL) : null;
let tableReady: Promise<unknown> | null = null;
const ensureTable = () =>
  (tableReady ??= sql!`CREATE TABLE IF NOT EXISTS margin_watch_store (
    id integer PRIMARY KEY,
    data jsonb NOT NULL,
    version integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`.catch((e) => {
    tableReady = null;
    throw e;
  }));

async function dbRead(): Promise<{ data: StoreData; version: number | null }> {
  await ensureTable();
  const rows = (await sql!`SELECT data, version FROM margin_watch_store WHERE id = 1`) as { data: StoreData; version: number }[];
  return rows.length ? { data: rows[0].data, version: rows[0].version } : { data: empty(), version: null };
}

/** Saves only if nobody else saved since `version` was read. Returns false if someone did. */
async function dbWrite(data: StoreData, version: number | null): Promise<boolean> {
  const json = JSON.stringify(data);
  const rows =
    version === null
      ? await sql!`INSERT INTO margin_watch_store (id, data, version) VALUES (1, ${json}::jsonb, 1) ON CONFLICT (id) DO NOTHING RETURNING version`
      : await sql!`UPDATE margin_watch_store SET data = ${json}::jsonb, version = version + 1, updated_at = now() WHERE id = 1 AND version = ${version} RETURNING version`;
  return (rows as unknown[]).length === 1;
}

/** Replaces everything (used by the restore script). */
export async function replaceStore(data: StoreData): Promise<void> {
  if (!sql) return writeFile(data);
  await ensureTable();
  const json = JSON.stringify(data);
  await sql`INSERT INTO margin_watch_store (id, data, version) VALUES (1, ${json}::jsonb, 1)
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = margin_watch_store.version + 1, updated_at = now()`;
}

/* ---------- local file ---------- */

async function readFile(): Promise<StoreData> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as StoreData;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return empty();
    throw e;
  }
}

async function writeFile(data: StoreData): Promise<void> {
  if (process.env.VERCEL) throw new Error("No database is connected. Add a Neon Postgres database to the Vercel project (see DEPLOY.md).");
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 1), "utf8");
  await fs.rename(tmp, FILE);
}

/* ---------- public ---------- */

export async function readStore(): Promise<StoreData> {
  return withDefaults(sql ? (await dbRead()).data : await readFile());
}

export const storageKind = () => (sql ? "database" : "file");

let queue: Promise<unknown> = Promise.resolve();

/**
 * Read, change, save. `fn` may run more than once (if someone else saved in between, it is redone
 * on the newer data), so it must only change `data` and return a result, nothing else.
 */
export function mutate<T>(fn: (data: StoreData) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    if (!sql) {
      const data = withDefaults(await readFile());
      const result = await fn(data);
      await writeFile(data);
      return result;
    }
    for (let attempt = 0; attempt < 6; attempt++) {
      const { data, version } = await dbRead();
      const working = withDefaults(data);
      const result = await fn(working);
      if (await dbWrite(working, version)) return result;
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 150));
    }
    throw new Error("Couldn't save because others kept saving at the same moment. Try again.");
  });
  queue = run.catch(() => undefined);
  return run;
}

const now = () => new Date().toISOString();

function pickEditable(patch: Partial<Job>): Partial<Job> {
  const out: Record<string, unknown> = {};
  for (const k of EDITABLE) if (k in patch) out[k] = (patch as Record<string, unknown>)[k];
  return out as Partial<Job>;
}

export function blankJob(partial: Partial<Job> = {}): Job {
  return {
    id: randomUUID(),
    jobNumber: "",
    name: "",
    product: "",
    rep: "",
    soldDate: null,
    state: "open",
    stage: null,
    completeDate: null,
    reportYear: null,
    contractValue: 0,
    financePct: 0,
    financed: false,
    depositAmount: 0,
    depositDate: null,
    stageAmount: 0,
    stageDate: null,
    finalAmount: 0,
    finalDate: null,
    materialsPaid: null,
    materialsEst: null,
    laborEst: null,
    laborActual: null,
    commissionRate: null,
    commissionPaid: 0,
    commissionPaidDate: null,
    materialsActual: null,
    notes: "",
    source: "manual",
    builderPrimeId: null,
    builderPrimeJobNumber: null,
    updatedAt: now(),
    ...partial,
  };
}

export const createJob = (partial: Partial<Job>) =>
  mutate((d) => {
    const job = blankJob({ ...pickEditable(partial), source: "manual" });
    d.jobs.push(job);
    return job;
  });

export const updateJob = (id: string, patch: Partial<Job>) =>
  mutate((d) => {
    const job = d.jobs.find((j) => j.id === id);
    if (!job) return null;
    const soldBefore = job.soldDate;
    Object.assign(job, pickEditable(patch), { updatedAt: now() });
    // Builder Prime gives the amount paid but not when; the deposit is taken at the sale.
    if (job.soldDate && job.soldDate !== soldBefore && job.depositAmount > 0 && !job.depositDate && !job.financed) job.depositDate = job.soldDate;
    return job;
  });

export const deleteJob = (id: string) =>
  mutate((d) => {
    const n = d.jobs.length;
    d.jobs = d.jobs.filter((j) => j.id !== id);
    return d.jobs.length < n;
  });

export interface CompleteInput {
  completeDate: string;
  finalAmount?: number;
  finalDate?: string | null;
}

/** Moves an open job to Completed — replaces the copy/paste between tabs. */
export const completeJob = (id: string, input: CompleteInput) =>
  mutate((d) => {
    const job = d.jobs.find((j) => j.id === id);
    if (!job) return null;
    job.state = "completed";
    job.stage = null;
    job.completeDate = input.completeDate;
    job.reportYear = Number(input.completeDate.slice(0, 4));
    if (typeof input.finalAmount === "number") job.finalAmount = input.finalAmount;
    if (input.finalDate !== undefined) job.finalDate = input.finalDate;
    job.updatedAt = now();
    return job;
  });

export const reopenJob = (id: string) =>
  mutate((d) => {
    const job = d.jobs.find((j) => j.id === id);
    if (!job) return null;
    job.state = "open";
    job.completeDate = null;
    job.reportYear = null;
    job.updatedAt = now();
    return job;
  });

export const updateSettings = (patch: Partial<Settings>) =>
  mutate((d) => {
    d.settings = { ...d.settings, ...patch };
    return d.settings;
  });
