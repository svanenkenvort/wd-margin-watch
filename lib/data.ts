import { readStore } from "./store";
import { availableYears, toRows } from "./stats";

export async function loadAll() {
  const { jobs, settings } = await readStore();
  const rows = toRows(jobs, settings);
  const years = availableYears(jobs);
  const thisYear = new Date().getFullYear();
  if (!years.includes(thisYear)) years.unshift(thisYear);
  return { rows, settings, years };
}

type Params = Promise<Record<string, string | string[] | undefined>>;

export async function readParams(searchParams: Params, years: number[]) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  const asked = Number(one("year"));
  const year = years.includes(asked) ? asked : years.includes(new Date().getFullYear()) ? new Date().getFullYear() : years[0];
  return { year, job: one("job") };
}
