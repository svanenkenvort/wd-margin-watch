import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Job, Settings, StoreData } from "./types";

/**
 * Storage layer. Everything the app saves goes through this file, so moving to a
 * hosted database for Vercel means replacing readStore/writeStore only.
 * Locally it is a single JSON file at data/store.json.
 */
const FILE = process.env.DATA_FILE ?? path.join(process.cwd(), "data", "store.json");

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

let queue: Promise<unknown> = Promise.resolve();

export async function readStore(): Promise<StoreData> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const data = JSON.parse(raw) as StoreData;
    data.settings = { ...DEFAULT_SETTINGS, ...data.settings };
    return data;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, settings: DEFAULT_SETTINGS, jobs: [] };
    }
    throw e;
  }
}

async function writeStore(data: StoreData): Promise<void> {
  if (process.env.VERCEL) {
    throw new Error(
      "This deployment has no database yet. Connect a database in lib/store.ts before saving on Vercel.",
    );
  }
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 1), "utf8");
  await fs.rename(tmp, FILE);
}

/** Run a read-modify-write one at a time so quick edits never overwrite each other. */
export function mutate<T>(fn: (data: StoreData) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const data = await readStore();
    const result = await fn(data);
    await writeStore(data);
    return result;
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
