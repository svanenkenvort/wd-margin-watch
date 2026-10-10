import { PageHead, Shell } from "@/components/Shell";
import { PrintButton } from "@/components/PrintButton";
import { ReportView } from "@/components/ReportView";
import { loadAll, readParams } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rows, settings, years } = await loadAll();
  const { year } = await readParams(searchParams, years);
  return (
    <Shell active="reports" year={year} years={years}>
      <PageHead title="Yearly report" sub="Ready for your bookkeeper or accountant.">
        <a className="btn" href={`/api/export?year=${year}`}>Download {year} jobs as CSV</a>
        <PrintButton />
      </PageHead>
      <ReportView rows={rows} settings={settings} year={year} />
    </Shell>
  );
}
