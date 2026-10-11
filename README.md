# Margin Watch

Replaces the MASTER TRACKER spreadsheet. Jobs, payments, margins and commissions for Window Depot,
with Builder Prime as the source for everything it already knows.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000 and sign in (copy `.env.example` to `.env.local` first and set `ADMIN_EMAIL` / `ADMIN_PASSWORD`). Your 2025 and 2026 jobs (343 jobs from the spreadsheet) are already loaded.

## Your daily routine

1. **Sync Builder Prime** (top right). New sales arrive as open jobs.
2. **Open jobs**: type only the shaded columns (materials est., labor est., finance %, materials paid,
   labor paid, commission rate, commission paid). Commission rate fills in from the rep's default.
3. When the install is done, click **Complete**. The job moves to Completed. No copy and paste.
4. **Overview** and **Yearly report** update by themselves. Report downloads as CSV or prints to PDF.

## Builder Prime

Settings: address `https://windowdepotnew.builderprime.com`, key in `.env.local` locally or in Vercel's environment variables (never committed).

**What comes from Builder Prime** (checked against the live API on 2026-10-10):

| From Builder Prime (sync) | You enter |
|---|---|
| Customer, sales rep (see below), product (windows, patio door, entry door) | ProVia Order # (the job number) |
| Contract value (after discounts, = Sold Contracts "Sale Amount") | Date sold |
| Total paid so far (goes in as the deposit on a new job; its date is the sale date once you enter it) | Labor est. and labor paid |
| Builder Prime cost (fills materials est. when empty) | Finance %, materials paid, payment split and dates |
| Builder Prime job #, status, completed date | Commission paid |

Builder Prime's API has no ProVia Order #, sale date, discount, payment dates or labor, so those are typed.

**Sales rep**: the project's sales person in Builder Prime (`salesPersonFirstName` / `salesPersonLastName`
on the project list; the API gives the name only, no user id).

- **Settings > Sales reps** lists every rep: the ones set up there, every rep on a job, and every Builder
  Prime sales person. One found by the app starts at 0% and is flagged until you set its commission rate.
- Each rep has a **Name in Builder Prime** (e.g. SCHMITZ = Mike Schmitz). The sync fills it in when it can
  tell; you can change it. A sales person not linked yet is matched by name: "SHAUN V", "SHAUN" or
  "SCHMITZ" if already in use, otherwise first name and last initial (and added as a rep).
- Each sync puts Builder Prime's sales person on every linked job: an empty rep is filled in and an open
  job takes that rep (and so their commission rate). A completed job keeps its rep and shows
  "Builder Prime rep: …" with a button to use it.

**How sync works**

- **First sync** reads every sold project (about 2–3 minutes: Builder Prime allows roughly 80 requests,
  then makes the app wait ~40 seconds; a bar at the bottom of the screen shows progress and counts
  down the wait). It links your existing jobs to their Builder Prime project by
  customer name and contract value, and adds nothing.
- **Returning customers**: every Builder Prime project is its own job. A project is only linked to a
  job of the same customer and contract value that was not sold before the project existed in
  Builder Prime, and a new sale never lands on a completed job, so a second purchase becomes a second
  job. When a same-name job might be the project but the sync can't confirm it, it asks (below)
  rather than guessing, so nothing is added twice.
- **After that**, each project that turns sold in Builder Prime comes in as an **open job**. Each sync
  re-reads only the projects linked to open jobs or still owing money (under a minute).
- **Linked open jobs** take Builder Prime's contract value (change orders), and an empty materials
  estimate or product is filled in. Completed jobs keep their numbers. Payments you typed are never
  changed: if they differ from Builder Prime's total, the job says so and offers to add the difference.
- **Settings > Builder Prime: needs a look** lists sold projects the sync could not place safely: same
  customer as a job but not confirmed (link, add as a new job, or leave out), or no job of that name
  (add, add all, or leave out). Open jobs shows a banner while anything is waiting there.

**Entering the rest**: on Open jobs, a missing ProVia Order # or date sold can be typed right in the
row, and each row says what else is missing. Opening a job shows a "Still to enter" checklist
(click an item to jump to it) and Builder Prime's figures for comparison.

## Where things are

- `lib/calc.ts`: every spreadsheet formula (finance charge, estimated and actual gross profit, commission owed).
- `lib/stats.ts`: totals, months, reps, products, "needs a look" list.
- `lib/builderprime.ts` and `lib/bp-mapping.ts`: the Builder Prime sync and the project fields it reads.
- `lib/store.ts`: all saving: Postgres when `DATABASE_URL` is set, otherwise `data/store.json` (not committed).
- `lib/session.ts`, `lib/users.ts`, `middleware.ts`: sign-in. `lib/excel.ts`: the Excel export.
- `scripts/import_xlsx.py`: re-import the spreadsheet if you ever need to (`python3 scripts/import_xlsx.py file.xlsx`).

## Deploying, signing in, and where the data lives

**DEPLOY.md** walks through putting the app on Vercel at dashboard.windowdepotnew.com.

- **Sign in:** everyone signs in with an email and password. Admins add and remove people under
  Settings → People who can sign in. The first admin comes from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
- **Data:** on Vercel it lives in a Neon Postgres database (`DATABASE_URL`), so deploys and syncs
  never lose it. On your computer, without `DATABASE_URL`, it is `data/store.json`.
- **Export:** Settings → Your data → **Export everything to Excel** (also on Open jobs), or download
  a raw backup file that `scripts/upload-store.mjs` can load back.

## Spreadsheet differences worth knowing

- Every margin in the app (dashboard, tables, reports, the target) is **gross profit after commission %**. The commission
  taken off is what is due on the job (contract × commission rate), or what was paid if that is more. The sheet took off
  only commission already paid, so a job looked better until the rep was paid. The target defaults to 40%; set it under
  Settings → Targets. Gross profit before commission is still shown in dollars, and as a % on the yearly report and in each job.

- Open jobs total: the sheet's contract total only summed rows 6 to 43 (49 jobs run to row 54), so it showed $436,089. The real total is $561,885.
- "Actual materials" is the materials estimate plus 3% of the contract (your formula). 14 jobs had a typed-over amount; those are kept as overrides.
- Production stage was read from the color of each job name (your legend on the Summary tab).
