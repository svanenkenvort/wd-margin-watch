import { body, fail, messageOf, ok } from "@/lib/api";
import { deleteJob, updateJob } from "@/lib/store";
import type { Job } from "@/lib/types";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const patch = await body<Partial<Job>>(req);
  if (!patch) return fail("Send the changes as JSON.");
  try {
    const job = await updateJob(id, patch);
    return job ? ok(job) : fail("That job no longer exists.", 404);
  } catch (e) {
    return fail(messageOf(e), 500);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    return (await deleteJob(id)) ? ok() : fail("That job no longer exists.", 404);
  } catch (e) {
    return fail(messageOf(e), 500);
  }
}
