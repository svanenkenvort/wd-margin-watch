import { signedOut } from "@/lib/api";
import { backup } from "@/lib/excel";
import { readStore } from "@/lib/store";
import { todayISO } from "@/lib/format";

export const dynamic = "force-dynamic";

/** The raw data as JSON, for safekeeping; scripts/upload-store.mjs can load it back. No passwords. */
export async function GET() {
  const denied = await signedOut();
  if (denied) return denied;
  return new Response(JSON.stringify(backup(await readStore()), null, 1), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="margin-watch-backup-${todayISO()}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
