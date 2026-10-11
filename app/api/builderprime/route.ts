import { fail, messageOf, ok, signedOut } from "@/lib/api";
import { BpError, syncStep, testConnection } from "@/lib/builderprime";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";
/** A sync step does about 25 seconds of work; this leaves room on any Vercel plan. */
export const maxDuration = 60;

/** GET = test the connection and say what a sync would do. */
export async function GET() {
  const denied = await signedOut();
  if (denied) return denied;
  const data = await readStore();
  try {
    return ok(await testConnection(data.settings, data));
  } catch (e) {
    return fail(messageOf(e), e instanceof BpError && e.status ? e.status : 502);
  }
}

/** POST = one step of a sync. The screen calls it until the answer's status is "done". */
export async function POST() {
  const denied = await signedOut();
  if (denied) return denied;
  const { settings } = await readStore();
  try {
    return ok(await syncStep(settings));
  } catch (e) {
    return fail(messageOf(e), e instanceof BpError && e.status ? e.status : 502);
  }
}
