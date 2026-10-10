/**
 * Builder Prime does not publish its response format, so field names are matched
 * against the likely candidates below (first hit wins; dotted paths reach into
 * nested objects). Use Settings > "Test connection" to see the real field names
 * from your account, then put the right one first in a list.
 */
export const BP_FIELDS = {
  id: ["id", "projectId", "uuid"],
  jobNumber: ["jobNumber", "projectNumber", "number", "contractNumber", "jobNo"],
  name: ["clientLastName", "client.lastName", "customerLastName", "lastName", "clientName", "client.name", "name", "projectName"],
  contractValue: ["contractAmount", "contractValue", "contractTotal", "totalContractAmount", "totalAmount", "contract.amount", "amount", "total"],
  soldDate: ["soldDate", "dateSold", "contractSignedDate", "signedDate", "saleDate", "contract.signedDate", "createdDate", "createdAt"],
  rep: ["salesPersonName", "salesperson.name", "salesPerson.name", "salesRepName", "salesRep", "salesPerson", "salesperson"],
  product: ["projectType", "projectTypeName", "type", "category"],
  depositAmount: ["depositAmount", "deposit", "paymentsReceived.deposit"],
  totalPaid: ["totalPaid", "paymentsReceived", "amountPaid", "totalPayments", "paidAmount"],
  status: ["status", "statusName", "projectStatus", "stage"],
} as const;

export type BpKey = keyof typeof BP_FIELDS;

function dig(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

export function pick(record: unknown, key: BpKey): unknown {
  for (const path of BP_FIELDS[key]) {
    const v = dig(record, path);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

export function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[$,\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Accepts ISO strings, "2026-06-01T00:00:00Z", or epoch milliseconds. Returns yyyy-mm-dd. */
export function asDate(v: unknown): string | null {
  if (typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (typeof v === "string") {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  return null;
}

export function asText(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const first = o.firstName ?? "";
    const last = o.lastName ?? "";
    const full = `${first} ${last}`.trim();
    return full || (typeof o.name === "string" ? o.name : "");
  }
  return "";
}
