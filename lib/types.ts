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
  updatedAt: string;
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
