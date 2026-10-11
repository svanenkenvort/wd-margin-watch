import { body, fail, messageOf, ok, signedOut } from "@/lib/api";
import { completeJob, type CompleteInput } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await signedOut();
  if (denied) return denied;
  const { id } = await params;
  const input = await body<CompleteInput>(req);
  if (!input?.completeDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.completeDate)) return fail("Pick the date the install was completed.");
  try {
    const job = await completeJob(id, input);
    return job ? ok(job) : fail("That job no longer exists.", 404);
  } catch (e) {
    return fail(messageOf(e), 500);
  }
}
