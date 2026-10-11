import { fail, messageOf, ok } from "@/lib/api";
import { syncProjects, testConnection, BpError } from "@/lib/builderprime";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** GET = test the connection and show what Builder Prime returns. */
export async function GET() {
  const data = await readStore();
  try {
    return ok(await testConnection(data.settings, data));
  } catch (e) {
    return fail(messageOf(e), e instanceof BpError && e.status ? e.status : 502);
  }
}

/** POST = pull projects into the app. The first sync reads every sold project and can take a few minutes. */
export async function POST() {
  const { settings } = await readStore();
  try {
    return ok(await syncProjects(settings));
  } catch (e) {
    return fail(messageOf(e), e instanceof BpError && e.status ? e.status : 502);
  }
}
