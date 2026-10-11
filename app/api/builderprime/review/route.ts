import { body, fail, messageOf, ok } from "@/lib/api";
import { applyReview, BpError, type ReviewAction } from "@/lib/builderprime";

export const dynamic = "force-dynamic";

/** Add, link or leave out a project the sync listed for review. */
export async function POST(req: Request) {
  const a = await body<ReviewAction>(req);
  if (!a || !["add", "addAll", "link", "ignore"].includes(a.action)) return fail("Send an action: add, addAll, link or ignore.");
  try {
    return ok(await applyReview(a));
  } catch (e) {
    return fail(messageOf(e), e instanceof BpError && e.status ? e.status : 500);
  }
}
