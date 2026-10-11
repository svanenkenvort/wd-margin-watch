import { ok } from "@/lib/api";
import { syncProgress } from "@/lib/builderprime";

export const dynamic = "force-dynamic";

/** Where a running sync is. waitLeft is in ms, so the screen's countdown doesn't depend on its clock. */
export async function GET() {
  const p = syncProgress();
  return ok({ ...p, waitLeft: p.waitUntil ? Math.max(0, p.waitUntil - Date.now()) : 0 });
}
