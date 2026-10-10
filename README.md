# Margin Watch

Replaces the MASTER TRACKER spreadsheet. Jobs, payments, margins and commissions for Window Depot,
with Builder Prime as the source for everything it already knows.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Your 2025 and 2026 jobs (343 jobs from the spreadsheet) are already loaded.

## Your daily routine

1. **Sync Builder Prime** (top right). New sales arrive as open jobs.
2. **Open jobs**: type only the shaded columns (materials est., labor est., finance %, materials paid,
   labor paid, commission rate, commission paid). Commission rate fills in from the rep's default.
3. When the install is done, click **Complete**. The job moves to Completed. No copy and paste.
4. **Overview** and **Yearly report** update by themselves. Report downloads as CSV or prints to PDF.

## Builder Prime

Settings: address `https://windowdepotnew.builderprime.com`, key in `.env.local` (never committed).
Builder Prime publishes no endpoint reference, so field names are matched by best guess in
`lib/bp-mapping.ts`. **First run: Settings, Test connection.** It shows the fields Builder Prime
returns for your account. If a value looks empty or wrong, put the correct field name first in the
matching list in `lib/bp-mapping.ts`. Sync never overwrites the numbers you typed.

## Where things are

- `lib/calc.ts`: every spreadsheet formula (finance charge, estimated and actual gross profit, commission owed).
- `lib/stats.ts`: totals, months, reps, products, "needs a look" list.
- `lib/store.ts`: all saving. Currently `data/store.json` (not committed).
- `scripts/import_xlsx.py`: re-import the spreadsheet if you ever need to (`python3 scripts/import_xlsx.py file.xlsx`).

## Deploying to Vercel later

Vercel cannot write to a file, so before deploying swap `readStore` and `writeStore` in `lib/store.ts`
for a hosted database (Vercel Postgres/Neon or Upstash Redis), add `BUILDERPRIME_API_KEY` and
`BUILDERPRIME_SUBDOMAIN` as Vercel environment variables, and add a login (the app has none yet,
and it shows your sales and margins). Until the database exists the app refuses to save on Vercel
and says why.

## Spreadsheet differences worth knowing

- Open jobs total: the sheet's contract total only summed rows 6 to 43 (49 jobs run to row 54), so it showed $436,089. The real total is $561,885.
- "Actual materials" is the materials estimate plus 3% of the contract (your formula). 14 jobs had a typed-over amount; those are kept as overrides.
- Production stage was read from the color of each job name (your legend on the Summary tab).
