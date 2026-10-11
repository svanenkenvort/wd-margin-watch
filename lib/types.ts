import type { BpProject } from "./bp-mapping";

export type Stage =
  | "awaitingDeposit"
  | "needsMeasure"
  | "toOrder"
  | "ordered"
  | "toSchedule"
  | "scheduled"
  | "completedAwaitingPay"
  | "awaitingFinal";

export type JobState = "open" | "completed";
export type JobSource = "sheet" | "builderprime" | "manual";

/** Everything stored for one job. Calculated columns are never stored — see calc.ts. */
export interface Job {
  id: string;
  /** The ProVia Order # (what the spreadsheet called the job number). */
  jobNumber: string;
  name: string;
  product: string;
  rep: string;
  soldDate: string | null; // yyyy-mm-dd
  state: JobState;
  stage: Stage | null;
  completeDate: string | null;
  /** Which year's report a completed job counts toward. */
  reportYear: number | null;
  contractValue: number;
  /** Fraction, e.g. 0.005 = 0.5% */
  financePct: number;
  financed: boolean;
  depositAmount: number;
  depositDate: string | null;
  stageAmount: number;
  stageDate: string | null;
  finalAmount: number;
  finalDate: string | null;
  // The hand-entered numbers (spreadsheet columns L, T, U, Y, AC, AE)
  materialsPaid: number | null;
  materialsEst: number | null;
  laborEst: number | null;
  laborActual: number | null;
  commissionRate: number | null; // null = use the rep's default
  commissionPaid: number;
  commissionPaidDate: string | null;
  /** Only set when actual materials were typed over the 3% formula. */
  materialsActual: number | null;
  notes: string;
  source: JobSource;
  builderPrimeId: string | null;
  /** Builder Prime's own job # (e.g. 1950), for finding the project there. Not the job number. */
  builderPrimeJobNumber?: string | null;
  /** What Builder Prime last said about this job (refreshed on every sync). */
  bp?: BpSnapshot | null;
  updatedAt: string;
}

/** Builder Prime's figures for a linked job, kept as reported (they are never typed). */
export interface BpSnapshot {
  status: string;
  projectName: string;
  projectType: string;
  /** Contract total after discounts (the Sold Contracts report's "Sale Amount"). */
  contracted: number | null;
  invoiced: number | null;
  paid: number | null;
  /** Builder Prime's cost (the report's "Contract Cost"). */
  cost: number | null;
  /** Builder Prime has the project as Complete. */
  complete: boolean;
  completedOn: string | null;
  syncedAt: string;
}

/** A sold Builder Prime project as the sync sees it. */
export interface BpCandidate {
  projectId: string;
  bpJobNumber: string;
  name: string;
  rep: string;
  product: string;
  stage: Stage;
  snapshot: BpSnapshot;
}

export interface BpReview {
  at: string;
  /** Open sold projects with no job of that customer in the app. */
  notInApp: BpCandidate[];
  /** Same customer name as a job in the app, but the sync couldn't confirm it is that job. */
  maybe: { project: BpCandidate; createdOn: string | null; jobs: { id: string; name: string; jobNumber: string; contractValue: number; soldDate: string | null; state: JobState }[] }[];
}

export interface RepSetting {
  name: string;
  commissionRate: number;
}

export interface Settings {
  targetMargin: number;
  materialsAllowance: number;
  reps: RepSetting[];
  builderPrime: { subdomain: string; lastSync: string | null };
}

export interface StoreData {
  version: 1;
  settings: Settings;
  jobs: Job[];
  /** Builder Prime projects already seen sold. Any project that turns sold later is a new sale. */
  bpSoldSeen?: string[];
  /** Builder Prime project details by project id, so a sync only re-reads what may have changed. */
  bpCache?: Record<string, { modified: number | null; contracted: number | null; invoiced: number | null; paid: number | null }>;
  /** Projects the last sync could not place safely, for you to add or link. */
  bpReview?: BpReview | null;
  /** Projects you chose to leave out of the app. */
  bpIgnored?: string[];
  /** A sync in progress (it runs in short steps), so it can carry on where it stopped. */
  bpSync?: {
    startedAt: number;
    fetched: number;
    sold: BpProject[];
    /** Project ids whose details still need reading, in order; `next` is how far it got. */
    toRead: string[];
    next: number;
    detailsRead: number;
    /** The step working on it now, and until when. */
    leaseUntil: number | null;
    leaseId: string | null;
  } | null;
  /** People who can sign in. */
  users?: User[];
}

export interface User {
  id: string;
  email: string;
  name: string;
  /** scrypt$salt$hash */
  passwordHash: string;
  admin: boolean;
  createdAt: string;
}

export const STAGES: { key: Stage; label: string; color: string }[] = [
  { key: "awaitingDeposit", label: "Awaiting deposit", color: "#9AA5A8" },
  { key: "needsMeasure", label: "Needs final measure", color: "#7A4FA3" },
  { key: "toOrder", label: "To be ordered", color: "#C4452F" },
  { key: "ordered", label: "Ordered", color: "#D9B31C" },
  { key: "toSchedule", label: "To be scheduled", color: "#5FA03A" },
  { key: "scheduled", label: "Scheduled", color: "#1D8FC4" },
  { key: "completedAwaitingPay", label: "Completed, awaiting payment", color: "#E08A00" },
  { key: "awaitingFinal", label: "Awaiting final payment", color: "#6D787B" },
];

export function stageMeta(stage: Stage | null) {
  return STAGES.find((s) => s.key === stage) ?? null;
}
