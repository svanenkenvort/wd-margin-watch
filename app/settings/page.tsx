import { PageHead, Shell } from "@/components/Shell";
import { SettingsPanel } from "@/components/SettingsPanel";
import { UsersPanel } from "@/components/UsersPanel";
import { foundReps } from "@/lib/bp-mapping";
import { bpConfig } from "@/lib/builderprime";
import { readStore, storageKind } from "@/lib/store";
import { publicUser, requireUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const me = await requireUser();
  const { settings, bpReview, users = [], jobs } = await readStore();
  const cfg = bpConfig(settings);
  const db = storageKind() === "database";
  const snapshots = [...jobs.map((j) => j.bp), ...(bpReview?.notInApp ?? []).map((c) => c.snapshot), ...(bpReview?.maybe ?? []).map((m) => m.project.snapshot)];
  // Reps on jobs or from Builder Prime that aren't set up yet are listed too (saved with the next change).
  const reps = foundReps(settings.reps, jobs.map((j) => j.rep), snapshots);
  // Builder Prime's sales people, from linked jobs and projects waiting for review.
  const people = new Map<string, { name: string; jobs: number; rep: string }>();
  for (const s of snapshots) {
    if (!s?.salesPerson) continue;
    const key = s.salesPerson.toUpperCase();
    const p = people.get(key) ?? { name: s.salesPerson, jobs: 0, rep: s.rep ?? "" };
    p.jobs++;
    people.set(key, p);
  }
  return (
    <Shell active="settings">
      <PageHead title="Settings" sub="Targets, commission rates, the Builder Prime connection, your data and who can sign in." />
      <SettingsPanel settings={{ ...settings, reps }} review={bpReview ?? null} bpPeople={[...people.values()].sort((a, b) => b.jobs - a.jobs)} bp={{ base: cfg.base, hasKey: cfg.hasKey, subdomain: cfg.subdomain }} />
      <section className="pane block" id="data">
        <h2 className="pane-title">Your data</h2>
        <p className="hint">
          {db
            ? `Saved in the app's Postgres database (Neon), ${jobs.length} jobs. Deploys and syncs don't touch it, and Neon keeps restore points.`
            : `Saved in a file on this computer (data/store.json), ${jobs.length} jobs. On Vercel the app needs its database; see DEPLOY.md.`}
        </p>
        <div className="btn-row">
          <a className="btn btn-primary" href="/api/export/excel">Export everything to Excel</a>
          <a className="btn" href="/api/export/backup">Download a backup file</a>
        </div>
        <p className="hint">The Excel file has every job (open and completed) with every field, the calculated margins and commissions, Builder Prime&apos;s figures, reps and settings. The backup file is the raw data, which can be loaded back into the app (DEPLOY.md, &quot;Restoring&quot;). Neither includes passwords.</p>
      </section>
      <UsersPanel me={publicUser(me)} users={users.map(publicUser)} />
    </Shell>
  );
}
