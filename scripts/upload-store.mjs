// Loads a data file into the app's database: your current data/store.json when you first deploy,
// or a backup downloaded from Settings > Your data.
//
//   node --env-file=.env.production.local scripts/upload-store.mjs data/store.json
//
// DATABASE_URL must point at the Neon database (vercel env pull puts it in that file).
// It shows what is there now and what would replace it; add --yes to go ahead.
// People who can sign in are kept from the database (a backup file holds no passwords).
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";

const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
const yes = process.argv.includes("--yes");
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!file) exit("Say which file to load, e.g. node --env-file=.env.production.local scripts/upload-store.mjs data/store.json");
if (!url) exit("DATABASE_URL isn't set. Run `vercel env pull .env.production.local --environment=production` first, and pass --env-file=.env.production.local.");

const data = JSON.parse(readFileSync(file, "utf8"));
if (!Array.isArray(data.jobs) || typeof data.settings !== "object") exit(`${file} doesn't look like Margin Watch data (no jobs or settings).`);

const sql = neon(url);
await sql`CREATE TABLE IF NOT EXISTS margin_watch_store (
  id integer PRIMARY KEY, data jsonb NOT NULL, version integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now())`;
const [current] = await sql`SELECT data, updated_at FROM margin_watch_store WHERE id = 1`;
const fileUsers = (data.users ?? []).filter((u) => u.passwordHash);
data.users = fileUsers.length ? fileUsers : current?.data?.users ?? [];
data.bpSync = null;

const describe = (d) => `${d.jobs.length} jobs (${d.jobs.filter((j) => j.state === "open").length} open), ${(d.users ?? []).length} people who can sign in`;
console.log(`File:     ${describe(data)}`);
console.log(current ? `Database: ${describe(current.data)}, last saved ${new Date(current.updated_at).toLocaleString()}` : "Database: empty");
if (current && !yes) exit("\nThis replaces what is in the database. Download a backup from Settings first if you might want it back, then run again with --yes.", 0);

await sql`INSERT INTO margin_watch_store (id, data, version) VALUES (1, ${JSON.stringify(data)}::jsonb, 1)
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = margin_watch_store.version + 1, updated_at = now()`;
console.log("\nLoaded. Reload the app to see it.");

function exit(msg, code = 1) {
  console.log(msg);
  process.exit(code);
}
