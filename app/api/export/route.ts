import { jobsToCsv } from "@/lib/csv";
import { readStore } from "@/lib/store";
import { completedIn, openRows, toRows } from "@/lib/stats";

export const dynamic = "force-dynamic";

/** /api/export?year=2026 downloads that year's completed jobs; ?scope=open downloads the open jobs. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const { jobs, settings } = await readStore();
  const rows = toRows(jobs, settings);
  const scope = url.searchParams.get("scope");
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
  const picked = scope === "open" ? openRows(rows) : completedIn(rows, year);
  const name = scope === "open" ? "open-jobs" : `completed-jobs-${year}`;
  return new Response(jobsToCsv(picked, settings), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
    },
  });
}
