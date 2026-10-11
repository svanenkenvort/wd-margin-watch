import { OpenJobsTable } from "@/components/OpenJobsTable";
import { PageHead, Shell } from "@/components/Shell";
import { Strip } from "@/components/Strip";
import { SyncButton } from "@/components/SyncButton";
import { loadAll, readParams } from "@/lib/data";
import { readStore } from "@/lib/store";
import { money, pct } from "@/lib/format";
import { openRows, summarize } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function OpenJobs({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rows, settings, years } = await loadAll();
  const { job } = await readParams(searchParams, years);
  const { bpReview } = await readStore();
  const review = (bpReview?.notInApp.length ?? 0) + (bpReview?.maybe.length ?? 0);
  const open = openRows(rows);
  const s = summarize(open);
  const needs = open.filter((r) => r.c.missing.length > 0).length;
  const target = settings.targetMargin;
  return (
    <Shell active="open" actions={<><a className="btn" href="/api/export/excel">Export to Excel</a><SyncButton /></>}>
      <PageHead title="Open jobs" sub="Type only what is highlighted: the ProVia Order #, date sold and your estimates. Contract value and payments come from Builder Prime; the rest is calculated." />
      <Strip
        items={[
          { label: "Open jobs", value: String(open.length) },
          { label: "Contract value", value: money(s.revenue) },
          { label: "Collected so far", value: money(s.collected) },
          { label: "Still to collect", value: money(s.balance) },
          { label: "Estimated margin after commission", value: pct(s.estAfterCommissionPct), tone: s.estAfterCommissionPct !== null && s.estAfterCommissionPct < target ? "warn" : "good", note: `target ${pct(target, 0)}` },
          { label: "Jobs with entries to make", value: String(needs), tone: needs ? "warn" : "good" },
        ]}
      />
      <OpenJobsTable rows={open} settings={settings} initialJobId={job} review={review} />
    </Shell>
  );
}
