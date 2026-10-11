import { CompletedTable } from "@/components/CompletedTable";
import { PageHead, Shell } from "@/components/Shell";
import { Strip } from "@/components/Strip";
import { loadAll, readParams } from "@/lib/data";
import { money, pct } from "@/lib/format";
import { completedIn, summarize } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function Completed({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rows, settings, years } = await loadAll();
  const { year, job } = await readParams(searchParams, years);
  const done = completedIn(rows, year);
  const s = summarize(done);
  const target = settings.targetMargin;
  return (
    <Shell active="completed" year={year} years={years}>
      <PageHead title={`${year} completed jobs`} sub="Jobs move here from Open jobs with one click. Fix anything by opening the job." />
      <Strip
        items={[
          { label: "Jobs", value: String(s.count) },
          { label: "Sales", value: money(s.revenue) },
          { label: "Gross profit", value: money(s.gross) },
          { label: "After commissions", value: money(s.afterCommission) },
          { label: "Margin after commission", value: pct(s.afterCommissionPct), tone: s.afterCommissionPct !== null && s.afterCommissionPct < target ? "warn" : "good", note: `target ${pct(target, 0)}` },
          { label: "Unpaid balances", value: money(s.balance), tone: s.balance > 1 ? "low" : "good" },
        ]}
      />
      <CompletedTable key={year} rows={done} settings={settings} year={year} initialJobId={job} />
    </Shell>
  );
}
