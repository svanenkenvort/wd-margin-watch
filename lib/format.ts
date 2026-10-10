const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export function money(n: number | null | undefined, cents = false): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return (cents ? usd2 : usd0).format(n);
}

/** $1.5M / $482K for tight spaces */
export function moneyShort(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1_000_000) return `${s}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 2)}M`;
  if (a >= 1_000) return `${s}$${(a / 1_000).toFixed(a >= 100_000 ? 0 : 1)}K`;
  return `${s}$${a.toFixed(0)}`;
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return `${(n * 100).toFixed(digits)}%`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthName = (i: number) => MONTHS[i];

/** yyyy-mm-dd -> "Oct 12, 2026" without any timezone shifting */
export function dateLabel(iso: string | null | undefined, withYear = true): string {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "–";
  return withYear ? `${MONTHS[m - 1]} ${d}, ${y}` : `${MONTHS[m - 1]} ${d}`;
}

export function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function utc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysSince(iso: string | null, today = todayISO()): number | null {
  if (!iso) return null;
  return Math.round((utc(today) - utc(iso)) / 86_400_000);
}

export function repLabel(rep: string): string {
  return rep
    .toLowerCase()
    .split(" ")
    .map((w) => (w.length <= 1 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}
