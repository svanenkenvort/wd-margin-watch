import { fail, messageOf, signedOut } from "@/lib/api";
import { workbook } from "@/lib/excel";
import { readStore } from "@/lib/store";
import { todayISO } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Everything in the app as an Excel workbook. */
export async function GET() {
  const denied = await signedOut();
  if (denied) return denied;
  try {
    const file = await workbook(await readStore());
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="margin-watch-${todayISO()}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return fail(messageOf(e), 500);
  }
}
