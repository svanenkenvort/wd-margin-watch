import { body, fail, messageOf, ok, signedOut } from "@/lib/api";
import { updateSettings } from "@/lib/store";
import type { Settings } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const denied = await signedOut();
  if (denied) return denied;
  const patch = await body<Partial<Settings>>(req);
  if (!patch) return fail("Send the settings as JSON.");
  const next: Partial<Settings> = {};
  if (typeof patch.targetMargin === "number" && patch.targetMargin > 0 && patch.targetMargin < 1) next.targetMargin = patch.targetMargin;
  if (typeof patch.materialsAllowance === "number" && patch.materialsAllowance >= 0 && patch.materialsAllowance < 0.5) next.materialsAllowance = patch.materialsAllowance;
  if (Array.isArray(patch.reps))
    next.reps = patch.reps
      .filter((r) => r && typeof r.name === "string" && r.name.trim())
      .map((r) => {
        const bpName = typeof r.builderPrimeName === "string" ? r.builderPrimeName.replace(/\s+/g, " ").trim() : "";
        return { name: r.name.trim().toUpperCase(), commissionRate: Math.min(Math.max(Number(r.commissionRate) || 0, 0), 1), ...(bpName ? { builderPrimeName: bpName } : {}), ...(r.needsRate === true ? { needsRate: true } : {}) };
      });
  try {
    return ok(await updateSettings(next));
  } catch (e) {
    return fail(messageOf(e), 500);
  }
}
