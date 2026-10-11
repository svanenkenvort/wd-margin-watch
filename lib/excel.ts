import ExcelJS from "exceljs";
import { stageMeta, type StoreData } from "./types";
import { toRows, type Row } from "./stats";

/**
 * Everything in the app as one Excel workbook: open and completed jobs (every field you typed,
 * every calculated figure, and Builder Prime's numbers), reps, settings, and the Builder Prime
 * review list. Sign-in details are never included.
 */

type Kind = "text" | "money" | "pct" | "date" | "number";
interface Col {
  header: string;
  width: number;
  kind: Kind;
  value: (r: Row) => unknown;
}

const MONEY = '"$"#,##0.00;[Red]-"$"#,##0.00';
const PCT = "0.0%";
const DATE = "m/d/yyyy";

/** yyyy-mm-dd as an Excel date (no time-zone shift). */
const day = (iso: string | null | undefined) => {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return y && m && d ? new Date(Date.UTC(y, m - 1, d)) : null;
};

const JOB_COLS: Col[] = [
  { header: "ProVia Order #", width: 14, kind: "text", value: ({ job }) => job.jobNumber },
  { header: "Customer", width: 22, kind: "text", value: ({ job }) => job.name },
  { header: "Product", width: 9, kind: "text", value: ({ job }) => job.product },
  { header: "Sales rep", width: 12, kind: "text", value: ({ job }) => job.rep },
  { header: "Date sold", width: 11, kind: "date", value: ({ job }) => day(job.soldDate) },
  { header: "Status", width: 10, kind: "text", value: ({ job }) => (job.state === "open" ? "Open" : "Completed") },
  { header: "Stage", width: 22, kind: "text", value: ({ job }) => stageMeta(job.stage)?.label ?? "" },
  { header: "Install completed", width: 12, kind: "date", value: ({ job }) => day(job.completeDate) },
  { header: "Report year", width: 8, kind: "number", value: ({ job }) => job.reportYear },
  { header: "Contract value", width: 14, kind: "money", value: ({ job }) => job.contractValue },
  { header: "Financed", width: 9, kind: "text", value: ({ job }) => (job.financed ? "Yes" : "") },
  { header: "Finance %", width: 9, kind: "pct", value: ({ job }) => job.financePct },
  { header: "Finance charges", width: 13, kind: "money", value: ({ c }) => c.financeCharges },
  { header: "Deposit", width: 12, kind: "money", value: ({ job }) => job.depositAmount },
  { header: "Deposit date", width: 11, kind: "date", value: ({ job }) => day(job.depositDate) },
  { header: "Stage payment", width: 12, kind: "money", value: ({ job }) => job.stageAmount },
  { header: "Stage payment date", width: 11, kind: "date", value: ({ job }) => day(job.stageDate) },
  { header: "Final payment", width: 12, kind: "money", value: ({ job }) => job.finalAmount },
  { header: "Final payment date", width: 11, kind: "date", value: ({ job }) => day(job.finalDate) },
  { header: "Total paid", width: 12, kind: "money", value: ({ c }) => c.totalPayments },
  { header: "Balance owed", width: 12, kind: "money", value: ({ c }) => c.balance },
  { header: "Materials est.", width: 12, kind: "money", value: ({ job }) => job.materialsEst },
  { header: "Labor est.", width: 12, kind: "money", value: ({ job }) => job.laborEst },
  { header: "Est. gross profit", width: 13, kind: "money", value: ({ c }) => c.estGross },
  { header: "Est. margin", width: 9, kind: "pct", value: ({ c }) => c.estPct },
  { header: "Materials paid to supplier", width: 13, kind: "money", value: ({ job }) => job.materialsPaid },
  { header: "Actual materials (typed)", width: 13, kind: "money", value: ({ job }) => job.materialsActual },
  { header: "Actual materials (used)", width: 13, kind: "money", value: ({ c }) => c.materialsActual },
  { header: "Labor paid", width: 12, kind: "money", value: ({ job }) => job.laborActual },
  { header: "Actual gross profit", width: 13, kind: "money", value: ({ c }) => c.grossActual },
  { header: "Actual margin", width: 9, kind: "pct", value: ({ c }) => c.actualPct },
  { header: "Commission rate", width: 10, kind: "pct", value: ({ c }) => c.commissionRate },
  { header: "Commission due", width: 12, kind: "money", value: ({ c }) => c.commissionDue },
  { header: "Commission paid", width: 12, kind: "money", value: ({ job }) => job.commissionPaid },
  { header: "Commission paid date", width: 11, kind: "date", value: ({ job }) => day(job.commissionPaidDate) },
  { header: "Commission owed", width: 12, kind: "money", value: ({ c }) => c.commissionOwed },
  { header: "Gross after commission", width: 13, kind: "money", value: ({ c }) => c.grossAfterCommission },
  { header: "Margin after commission", width: 10, kind: "pct", value: ({ c }) => c.afterCommissionPct },
  { header: "Still to enter", width: 28, kind: "text", value: ({ c }) => c.missing.map((m) => m.label).join(", ") },
  { header: "Notes", width: 30, kind: "text", value: ({ job }) => job.notes },
  { header: "Came from", width: 12, kind: "text", value: ({ job }) => ({ sheet: "Spreadsheet", builderprime: "Builder Prime", manual: "Added by hand" })[job.source] },
  { header: "Builder Prime job #", width: 10, kind: "text", value: ({ job }) => job.builderPrimeJobNumber ?? "" },
  { header: "BP status", width: 12, kind: "text", value: ({ job }) => job.bp?.status ?? "" },
  { header: "BP contract", width: 12, kind: "money", value: ({ job }) => job.bp?.contracted ?? null },
  { header: "BP invoiced", width: 12, kind: "money", value: ({ job }) => job.bp?.invoiced ?? null },
  { header: "BP paid", width: 12, kind: "money", value: ({ job }) => job.bp?.paid ?? null },
  { header: "BP cost", width: 12, kind: "money", value: ({ job }) => job.bp?.cost ?? null },
  { header: "BP synced", width: 11, kind: "date", value: ({ job }) => day(job.bp?.syncedAt) },
  { header: "Last changed", width: 11, kind: "date", value: ({ job }) => day(job.updatedAt) },
  { header: "App id", width: 12, kind: "text", value: ({ job }) => job.id },
];

const FMT: Record<Kind, string | undefined> = { money: MONEY, pct: PCT, date: DATE, number: "0", text: undefined };

function sheet(wb: ExcelJS.Workbook, name: string, cols: { header: string; width: number; kind: Kind }[], rows: unknown[][]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1, xSplit: name.includes("jobs") ? 2 : 0 }] });
  ws.columns = cols.map((c) => ({ header: c.header, width: c.width, style: FMT[c.kind] ? { numFmt: FMT[c.kind] } : {} }));
  for (const r of rows) ws.addRow(r.map((v) => (v === undefined ? null : v)));
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.alignment = { vertical: "middle", wrapText: true };
  head.height = 32;
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE1EFF1" } };
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}

export async function workbook(data: StoreData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Margin Watch";
  wb.created = new Date();
  const rows = toRows(data.jobs, data.settings);
  const byDate = (a: Row, b: Row) => (a.job.soldDate ?? "").localeCompare(b.job.soldDate ?? "");
  const jobRows = (list: Row[]) => list.map((r) => JOB_COLS.map((c) => c.value(r)));

  sheet(wb, "Open jobs", JOB_COLS, jobRows(rows.filter((r) => r.job.state === "open").sort(byDate)));
  sheet(
    wb,
    "Completed jobs",
    JOB_COLS,
    jobRows(rows.filter((r) => r.job.state === "completed").sort((a, b) => (b.job.completeDate ?? "").localeCompare(a.job.completeDate ?? ""))),
  );
  sheet(
    wb,
    "Sales reps",
    [{ header: "Rep", width: 18, kind: "text" }, { header: "Default commission", width: 14, kind: "pct" }],
    data.settings.reps.map((r) => [r.name, r.commissionRate]),
  );
  sheet(
    wb,
    "Settings",
    [{ header: "Setting", width: 34, kind: "text" }, { header: "Value", width: 30, kind: "text" }],
    [
      ["Target gross profit", `${(data.settings.targetMargin * 100).toFixed(1)}%`],
      ["Materials allowance added to estimates", `${(data.settings.materialsAllowance * 100).toFixed(1)}%`],
      ["Builder Prime account", data.settings.builderPrime.subdomain],
      ["Last Builder Prime sync", data.settings.builderPrime.lastSync ?? "never"],
      ["Exported", new Date().toISOString()],
      ["Jobs", String(data.jobs.length)],
    ],
  );
  const review = data.bpReview;
  if (review && (review.notInApp.length || review.maybe.length)) {
    sheet(
      wb,
      "Builder Prime review",
      [
        { header: "Waiting because", width: 30, kind: "text" },
        { header: "Customer", width: 22, kind: "text" },
        { header: "Builder Prime job #", width: 10, kind: "text" },
        { header: "Project", width: 30, kind: "text" },
        { header: "Rep", width: 12, kind: "text" },
        { header: "Status", width: 12, kind: "text" },
        { header: "Contract", width: 12, kind: "money" },
        { header: "Paid", width: 12, kind: "money" },
        { header: "Cost", width: 12, kind: "money" },
      ],
      [
        ...review.maybe.map((m) => ["Same customer as a job, not confirmed", m.project] as const),
        ...review.notInApp.map((c) => ["Not in the app", c] as const),
      ].map(([why, c]) => [why, c.name, c.bpJobNumber, c.snapshot.projectName, c.rep, c.snapshot.status, c.snapshot.contracted, c.snapshot.paid, c.snapshot.cost]),
    );
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** The raw data, for safekeeping or restoring (scripts/upload-store.mjs). No passwords. */
export function backup(data: StoreData): StoreData {
  return { ...data, users: (data.users ?? []).map((u) => ({ ...u, passwordHash: "" })), bpSync: null };
}
