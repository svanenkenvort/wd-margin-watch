import type { Job, Settings } from "./types";

/** Mirrors the formulas in the MASTER TRACKER spreadsheet. */
export interface Computed {
  financeCharges: number;
  totalPayments: number;
  balance: number;
  depositLessInventory: number;
  estGross: number;
  estPct: number;
  materialsActual: number;
  /** null until both materials and labor actuals exist (the sheet shows "n/a") */
  grossActual: number | null;
  actualPct: number | null;
  commissionRate: number;
  commissionDue: number;
  commissionOwed: number;
  grossAfterCommission: number | null;
  afterCommissionPct: number | null;
  /** Hand-entered numbers still missing */
  missing: string[];
}

export function repRate(settings: Settings, rep: string): number {
  return settings.reps.find((r) => r.name === rep)?.commissionRate ?? 0;
}

export function compute(job: Job, settings: Settings): Computed {
  const g = job.contractValue || 0;
  const financeCharges = g * (job.financePct || 0);
  const totalPayments = (job.depositAmount || 0) + (job.stageAmount || 0) + (job.finalAmount || 0);
  const balance = g - totalPayments;
  const depositLessInventory = (job.depositAmount || 0) - (job.materialsPaid || 0);

  const materialsEst = job.materialsEst ?? 0;
  const laborEst = job.laborEst ?? 0;
  const estGross = g - financeCharges - materialsEst - laborEst;
  const estPct = g ? estGross / g : 0;

  const materialsActual =
    job.materialsActual ?? settings.materialsAllowance * g + materialsEst;
  const laborActual = job.laborActual ?? 0;
  const hasActuals = materialsActual > 0 && laborActual > 0;
  const grossActual = hasActuals ? g - financeCharges - materialsActual - laborActual : null;
  const actualPct = grossActual !== null && g ? grossActual / g : null;

  const commissionRate = job.commissionRate ?? repRate(settings, job.rep);
  const commissionDue = g * commissionRate;
  const commissionOwed = commissionDue - (job.commissionPaid || 0);
  const grossAfterCommission = grossActual !== null ? grossActual - (job.commissionPaid || 0) : null;
  const afterCommissionPct =
    grossAfterCommission !== null && g ? grossAfterCommission / g : null;

  const missing: string[] = [];
  if (job.materialsEst === null) missing.push("Materials est.");
  if (job.laborEst === null) missing.push("Labor est.");
  if (job.state === "completed" && job.laborActual === null) missing.push("Labor paid");

  return {
    financeCharges,
    totalPayments,
    balance,
    depositLessInventory,
    estGross,
    estPct,
    materialsActual,
    grossActual,
    actualPct,
    commissionRate,
    commissionDue,
    commissionOwed,
    grossAfterCommission,
    afterCommissionPct,
    missing,
  };
}
