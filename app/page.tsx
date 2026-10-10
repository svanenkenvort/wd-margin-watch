import { DashboardView } from "@/components/DashboardView";
import { PageHead, Shell } from "@/components/Shell";
import { SyncButton } from "@/components/SyncButton";
import { loadAll, readParams } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Overview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rows, settings, years } = await loadAll();
  const { year } = await readParams(searchParams, years);
  return (
    <Shell active="overview" year={year} years={years} actions={<SyncButton />}>
      <PageHead title={`${year} overview`} sub="Gross profit, cash and commissions across your finished and open jobs." />
      <DashboardView rows={rows} settings={settings} year={year} />
    </Shell>
  );
}
