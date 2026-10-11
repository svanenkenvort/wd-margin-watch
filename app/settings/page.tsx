import { PageHead, Shell } from "@/components/Shell";
import { SettingsPanel } from "@/components/SettingsPanel";
import { UsersPanel } from "@/components/UsersPanel";
import { bpConfig } from "@/lib/builderprime";
import { readStore, storageKind } from "@/lib/store";
import { publicUser, requireUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const me = await requireUser();
  const { settings, bpReview, users = [], jobs } = await readStore();
  const cfg = bpConfig(settings);
  const db = storageKind() === "database";
  return (
    <Shell active="settings">
      <PageHead title="Settings" sub="Targets, commission rates, the Builder Prime connection, your data and who can sign in." />
      <SettingsPanel settings={settings} review={bpReview ?? null} bp={{ base: cfg.base, hasKey: cfg.hasKey, subdomain: cfg.subdomain }} />
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
