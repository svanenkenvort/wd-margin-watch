import { asDate, asNumber, asText, pick } from "./bp-mapping";
import { blankJob, mutate } from "./store";
import type { Job, Settings } from "./types";

/**
 * Builder Prime Open API client.
 * Base URL: https://{subdomain}.builderprime.com   Auth: x-api-key header (set in .env.local).
 * Builder Prime publishes no endpoint reference, so this is deliberately tolerant and
 * everything it learns is shown in Settings > Test connection.
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

function listFrom(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    for (const k of ["data", "items", "results", "projects", "content", "records"]) if (Array.isArray(o[k])) return o[k] as unknown[];
  }
  return [];
}

export async function fetchProjects(settings: Settings, limit = 2000): Promise<{ records: unknown[]; shape: string }> {
  const first = await bpGet(settings, "/api/projects/v1");
  const records = [...listFrom(first)];
  const shape = Array.isArray(first) ? "array" : `object with keys: ${Object.keys((first as object) ?? {}).join(", ")}`;
  // Page through if the API pages with ?page=. Stops when a page repeats or comes back empty.
  const firstId = JSON.stringify(records[0] ?? null);
  for (let page = 2; page <= 40 && records.length < limit && records.length > 0; page++) {
    let next: unknown[] = [];
    try {
      next = listFrom(await bpGet(settings, "/api/projects/v1", { page: String(page) }));
    } catch {
      break;
    }
    if (!next.length || JSON.stringify(next[0]) === firstId) break;
    records.push(...next);
  }
  return { records, shape };
}

export interface MappedProject {
  builderPrimeId: string | null;
  jobNumber: string;
  name: string;
  contractValue: number | null;
  soldDate: string | null;
  rep: string;
  product: string;
  depositAmount: number | null;
  totalPaid: number | null;
  status: string;
}

export function mapProject(r: unknown): MappedProject {
  const id = pick(r, "id");
  return {
    builderPrimeId: id !== undefined ? String(id) : null,
    jobNumber: asText(pick(r, "jobNumber")),
    name: asText(pick(r, "name")).toUpperCase(),
    contractValue: asNumber(pick(r, "contractValue")),
    soldDate: asDate(pick(r, "soldDate")),
    rep: asText(pick(r, "rep")).toUpperCase(),
    product: asText(pick(r, "product")).toUpperCase(),
    depositAmount: asNumber(pick(r, "depositAmount")),
    totalPaid: asNumber(pick(r, "totalPaid")),
    status: asText(pick(r, "status")),
  };
}

export async function testConnection(settings: Settings) {
  const cfg = bpConfig(settings);
  const { records, shape } = await fetchProjects(settings, 25);
  const sample = records[0] ?? null;
  return {
    base: cfg.base,
    shape,
    count: records.length,
    fieldNames: sample && typeof sample === "object" ? Object.keys(sample as object) : [],
    mapped: sample ? mapProject(sample) : null,
    sample,
  };
}

export interface SyncReport {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  skippedReason: string[];
}

/**
 * Pulls projects from Builder Prime. New projects arrive as open jobs; existing jobs only get the
 * fields Builder Prime owns (name, contract value, sold date, rep, payments). The seven numbers
 * you enter by hand are never overwritten.
 */
export async function syncProjects(settings: Settings): Promise<SyncReport> {
  const { records } = await fetchProjects(settings);
  const mapped = records.map(mapProject);
  const report: SyncReport = { fetched: mapped.length, created: 0, updated: 0, skipped: 0, skippedReason: [] };

  await mutate((d) => {
    for (const m of mapped) {
      if (!m.jobNumber || m.contractValue === null) {
        report.skipped++;
        if (report.skippedReason.length < 5) report.skippedReason.push(`Project ${m.builderPrimeId ?? "?"} has no job number or contract value`);
        continue;
      }
      const existing: Job | undefined =
        d.jobs.find((j) => m.builderPrimeId && j.builderPrimeId === m.builderPrimeId) ??
        d.jobs.find((j) => j.jobNumber === m.jobNumber && Math.abs(j.contractValue - (m.contractValue ?? 0)) < 0.01);
      if (existing) {
        let changed = false;
        const set = <K extends keyof Job>(k: K, v: Job[K]) => {
          if (v !== undefined && existing[k] !== v) {
            existing[k] = v;
            changed = true;
          }
        };
        if (!existing.builderPrimeId && m.builderPrimeId) set("builderPrimeId", m.builderPrimeId);
        if (existing.state === "open") {
          if (m.soldDate) set("soldDate", m.soldDate);
          if (m.depositAmount !== null) set("depositAmount", m.depositAmount);
        }
        if (changed) {
          existing.updatedAt = new Date().toISOString();
          report.updated++;
        }
      } else {
        d.jobs.push(
          blankJob({
            builderPrimeId: m.builderPrimeId,
            jobNumber: m.jobNumber,
            name: m.name || "NEW JOB",
            product: m.product,
            rep: m.rep,
            soldDate: m.soldDate,
            contractValue: m.contractValue ?? 0,
            depositAmount: m.depositAmount ?? m.totalPaid ?? 0,
            source: "builderprime",
          }),
        );
        report.created++;
      }
    }
    d.settings.builderPrime.lastSync = new Date().toISOString();
  });
  return report;
}
