import type { Settings } from "./types";
import type { Row } from "./stats";

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function jobsToCsv(rows: Row[], _settings: Settings): string {
  const head = [
    "Job #", "Product", "Job name", "Date sold", "Status", "Complete date", "Contract value", "Finance %", "Finance charges",
    "Deposit", "Deposit date", "Stage payment", "Final payment", "Final payment date", "Total payments", "Balance owed",
    "Materials est", "Labor est", "Gross profit est", "Gross profit est %", "Materials actual", "Labor actual",
    "Gross profit actual", "Gross profit actual %", "Rep", "Commission rate", "Commission paid", "Commission owed",
    "Gross after commissions", "Gross after commissions %", "Notes",
  ];
  const r2 = (n: number | null) => (n === null ? "" : Math.round(n * 100) / 100);
  const r4 = (n: number | null) => (n === null ? "" : Math.round(n * 10000) / 10000);
  const lines = rows.map(({ job: j, c }) =>
    [
      j.jobNumber, j.product, j.name, j.soldDate, j.state === "open" ? "Open" : "Completed", j.completeDate, r2(j.contractValue),
      r4(j.financePct), r2(c.financeCharges), r2(j.depositAmount), j.financed ? "Financed" : j.depositDate, r2(j.stageAmount),
      r2(j.finalAmount), j.finalDate, r2(c.totalPayments), r2(c.balance), r2(j.materialsEst), r2(j.laborEst), r2(c.estGross),
      r4(c.estPct), r2(c.materialsActual), r2(j.laborActual), r2(c.grossActual), r4(c.actualPct), j.rep, r4(c.commissionRate),
      r2(j.commissionPaid), r2(c.commissionOwed), r2(c.grossAfterCommission), r4(c.afterCommissionPct), j.notes,
    ].map(esc).join(","),
  );
  return [head.map(esc).join(","), ...lines].join("\r\n");
}
