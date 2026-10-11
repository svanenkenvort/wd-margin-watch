import { body, fail, messageOf, ok, signedOut } from "@/lib/api";
import { createJob } from "@/lib/store";
import type { Job } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await signedOut();
  if (denied) return denied;
  const data = await body<Partial<Job>>(req);
  if (!data) return fail("Send the job as JSON.");
  if (!data.name?.trim()) return fail("Add a job name.");
  try {
    return ok(await createJob({ ...data, name: data.name.trim().toUpperCase() }));
  } catch (e) {
    return fail(messageOf(e), 500);
  }
}
