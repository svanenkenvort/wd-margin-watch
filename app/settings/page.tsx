import { PageHead, Shell } from "@/components/Shell";
import { SettingsPanel } from "@/components/SettingsPanel";
import { bpConfig } from "@/lib/builderprime";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const { settings } = await readStore();
  const cfg = bpConfig(settings);
  return (
    <Shell active="settings">
      <PageHead title="Settings" sub="Targets, commission rates and the Builder Prime connection." />
      <SettingsPanel settings={settings} bp={{ base: cfg.base, hasKey: cfg.hasKey, subdomain: cfg.subdomain }} />
    </Shell>
  );
}
