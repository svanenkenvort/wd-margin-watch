import { fail, messageOf, ok, signedOut } from "@/lib/api";
import { reopenJob } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await signedOut();
  if (denied) return denied;
  const { id } = await params;
  try {
    const job = await reopenJob(id);
    return job ? ok(job) : fail("That job no longer exists.", 404);
  } catch (e) {
    return fail(messageOf(e), 500);
  }
}
