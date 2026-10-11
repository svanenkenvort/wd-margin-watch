# Deploying Margin Watch to Vercel

This puts the app at **https://dashboard.windowdepotnew.com**, behind a sign-in, with its data in a
Postgres database that deploys and syncs never touch. Plan on about an hour, most of it waiting for DNS.

Screens in Vercel and Neon get renamed from time to time. If a button below isn't where this says,
look for the closest match; the steps stay the same.

---

## Where the data lives

| What | Where | Survives deploys, syncs and restarts? |
|---|---|---|
| Jobs, payments, settings, reps, people who can sign in | **Neon Postgres**, connected to the Vercel project. One table, `margin_watch_store`, which the app creates by itself | Yes. The database is separate from the code |
| The code | GitHub; Vercel builds it on each push | Holds no data |
| Secrets (Builder Prime key, sign-in secret) | Vercel **Environment Variables** | Yes. Never in GitHub |

Vercel's own servers keep nothing between requests, so the app never stores data there. A Builder
Prime sync writes to the database as it goes. If a sync is interrupted, the next one carries on where it stopped.

**Your copies:** **Settings → Your data → Export everything to Excel** (also on the Open jobs page)
gives a workbook with every job, payment, estimate, margin and commission, plus Builder Prime's
figures. **Download a backup file** gives the raw data, which can be loaded back in (see
[Restoring](#restoring)). Download one of these regularly, e.g. every Friday.

---

## Before you start

- [ ] The code is merged into `main` on GitHub (`svanenkenvort/wd-margin-watch`).
- [ ] A Vercel account. **Use Vercel Pro:** the free Hobby plan is for personal, non-commercial
      use only, and this is a business app.
- [ ] Access to the DNS settings for `windowdepotnew.com`, wherever the domain is managed
      (GoDaddy, Cloudflare, Google/Squarespace, etc.).
- [ ] A **new** Builder Prime API key: Builder Prime → Admin → Integrations → Open API, with
      permission to read projects. Retire the old key, because it was pasted into a chat.
- [ ] Your current data file, `data/store.json`, on the computer where you've been running the app.
- [ ] Node.js 20.6 or newer on that computer, for the one-time data upload (`node -v` to check).

---

## 1. Create the Vercel project

1. Go to **vercel.com → Add New… → Project**.
2. Under **Import Git Repository**, pick `svanenkenvort/wd-margin-watch`. If it isn't listed, use
   **Adjust GitHub App Permissions** to give Vercel access to that repository.
3. Leave the settings as they are (Framework: **Next.js**, Root Directory: `./`) and click **Deploy**.
   The first deploy may finish with the app saying it isn't set up yet. That's expected; it redeploys after the next steps.

## 2. Add the database (Neon)

1. In the project, open the **Storage** tab → **Create Database** → choose **Neon** (Serverless Postgres) → **Continue**.
2. **Region:** choose **US East (N. Virginia / Washington, D.C.)**. That's where Vercel runs the app
   by default (`iad1`), so the two sit next to each other.
3. **Plan:** **Free** is enough to start: 1 GB of storage, and this app's data is about 1 MB.
   The paid **Launch** plan (pay as you go) keeps 7 days of restore points instead of the Free plan's
   6 hours. Consider it once you rely on the app.
4. Name it e.g. `margin-watch` and create it.
5. When asked which environments to connect, tick **Production** and **Development**. Leave
   **Preview** unticked, so test deployments of branches can't change your real data.

This adds `DATABASE_URL` (and a few similar `PG…`/`POSTGRES_…` variables) to the project. Don't edit them.

## 3. Add the environment variables

**Project → Settings → Environment Variables.** Add each of these for **Production** (and
Development, if you'll run the app on your computer against the real database):

| Name | Value |
|---|---|
| `BUILDERPRIME_API_KEY` | The new Builder Prime key |
| `BUILDERPRIME_SUBDOMAIN` | `windowdepotnew` |
| `AUTH_SECRET` | 32+ random characters. Make one with `openssl rand -base64 48` (Mac/Linux/Git Bash), or in PowerShell: `[Convert]::ToBase64String((1..48 \| % {[byte](Get-Random -Max 256)}))` |
| `ADMIN_EMAIL` | `shaun@windowdepotnew.com` (the first admin's sign-in) |
| `ADMIN_PASSWORD` | The first admin's password, 10+ characters |
| `ADMIN_NAME` | Optional, e.g. `Shaun` |

Mark `BUILDERPRIME_API_KEY`, `AUTH_SECRET` and `ADMIN_PASSWORD` as **Sensitive**.

`ADMIN_EMAIL` and `ADMIN_PASSWORD` are only used while nobody has an account. The first sign-in
with them creates the admin, and after that they do nothing (step 6 removes them).
`AUTH_SECRET` signs the sign-in cookies. Changing it signs everyone out, which is fine, but
don't lose or share it.

## 4. Deploy

**Deployments →** the latest one **→ ⋯ → Redeploy**. Environment variables only take effect on a new deploy.
When it shows **Ready**, open the `….vercel.app` address. You should see the **Sign in** page.
**Don't sign in or sync yet; load your data first (step 5).**

## 5. Load your existing data (one time)

On the computer that has `data/store.json`, in the project folder:

```bash
git pull origin main
npm install
npx vercel login                 # sign in to Vercel in the browser
npx vercel link                  # pick your team and the margin-watch project
npx vercel env pull .env.production.local --environment=production
node --env-file=.env.production.local scripts/upload-store.mjs data/store.json
```

The last command prints what's in the file and what's in the database. With an empty database it
loads straight away. If the database already has data, it stops and asks you to run it again with
`--yes`, which replaces what's there.

`.env.production.local` holds the live secrets. It is never committed (`.gitignore` covers it).
Delete it when you're done: `rm .env.production.local` (or `del` on Windows).

> Never ran the app locally? Create `data/store.json` from the spreadsheet first:
> `python3 scripts/import_xlsx.py "MASTER TRACKER.xlsx"`, then run the upload.

## 6. Sign in and add people

1. Open the app and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
2. **Settings → People who can sign in**:
   - **Change your password** if you like.
   - **Add someone:** name, email and a starting password (10+ characters). Tick **Admin** only for
     people who should be able to add and remove others. Give them their email and starting password;
     they can change it under Settings.
   - Admins can **Reset password**, **Make admin / Remove admin** and **Remove**. Removing someone
     signs them out at once.
3. Back in Vercel, delete `ADMIN_PASSWORD` (and optionally `ADMIN_EMAIL`) from the environment variables.
   They're no longer used, and it's better not to keep a password lying around.

Everyone who signs in sees all jobs and numbers; "Admin" only controls who can manage people.
Sign-ins last 30 days. Changing a password signs out that person's other devices.

## 7. Point dashboard.windowdepotnew.com at the app

1. **Project → Settings → Domains → Add**, enter `dashboard.windowdepotnew.com`, then **Add**.
2. Vercel shows the DNS record to create, normally a **CNAME** with name **`dashboard`**. Copy the
   exact value Vercel shows; it's often `cname.vercel-dns.com`, but some projects get their own.
3. At your DNS provider, for `windowdepotnew.com`, add that record:
   - Type **CNAME**, Name/Host **`dashboard`**, Value **what Vercel showed**, TTL default.
   - On **Cloudflare**, set it to **DNS only** (grey cloud), not proxied.
   - This doesn't affect `windowdepotnew.com` or `www`.
4. Wait until Vercel shows **Valid Configuration** (minutes, sometimes up to a few hours). Vercel
   adds the HTTPS certificate itself.
5. Open https://dashboard.windowdepotnew.com and sign in.

## 8. First Builder Prime sync

1. **Open jobs → Sync Builder Prime.** The first sync reads every sold project, which takes about
   2–3 minutes. A bar at the bottom shows how far it got. When Builder Prime makes the app wait
   (it allows about 80 requests at a time), the bar counts down and then carries on.
   **Keep the page open.** If you close it, press Sync again later and it carries on where it stopped.
2. **Settings → Builder Prime: needs a look:** link, add or leave out the projects the sync
   couldn't place by itself (details in README.md).
3. After that, sync whenever you like. It only re-reads open and changed jobs, usually under a minute.

---

## Restoring

**From a backup file** (Settings → Your data → Download a backup file):

```bash
npx vercel env pull .env.production.local --environment=production
node --env-file=.env.production.local scripts/upload-store.mjs margin-watch-backup-2026-10-10.json --yes
```

The people who can sign in are kept as they are now (a backup file holds no passwords).

**From Neon's restore points** (to undo something within the last 6 hours on Free, or 7 days on
Launch): open the database in Neon (Vercel → Storage → the database → **Open in Neon**) → **Branches**
→ main branch → **Restore**, and pick a time before the problem.

Deleting the Vercel project or the Neon database can delete the data with it. Download a backup first.

---

## Running it on your computer

Copy `.env.example` to `.env.local` and fill in the Builder Prime key and the `ADMIN_…` values.
Without `DATABASE_URL`, the app uses `data/store.json` on your computer, separate from the live data.
`AUTH_SECRET` can stay empty locally. Then:

```bash
npm install
npm run dev        # http://localhost:3000
```

---

## If something goes wrong

| You see | Fix |
|---|---|
| "Sign-in isn't set up yet: AUTH_SECRET is missing" | Add `AUTH_SECRET` (step 3), then redeploy |
| "No one has an account yet…" | Add `ADMIN_EMAIL` and `ADMIN_PASSWORD` (10+ characters), redeploy, sign in |
| "No database is connected" | Connect Neon to the project for Production (step 2), then redeploy |
| "Builder Prime rejected the API key" | Check `BUILDERPRIME_API_KEY` and that the key can read projects, then redeploy |
| A sync stopped partway | Press Sync again; it carries on where it stopped |
| `upload-store.mjs` says DATABASE_URL isn't set | Run the `vercel env pull` line, and pass `--env-file=.env.production.local` |
| Domain stuck on "Invalid Configuration" | Check the CNAME name is `dashboard` and the value is exactly what Vercel shows; on Cloudflare, DNS only |

**Locked out** (forgot the password and no other admin can reset it):

1. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in Vercel again, and redeploy.
2. In Neon's **SQL Editor** (Vercel → Storage → the database → Open in Neon → SQL Editor), run:
   ```sql
   UPDATE margin_watch_store
   SET data = jsonb_set(data, '{users}', '[]'::jsonb), version = version + 1
   WHERE id = 1;
   ```
   This removes everyone's sign-in and nothing else; jobs and settings stay.
3. Sign in with the `ADMIN_…` values (this recreates the admin), add everyone back, then remove
   `ADMIN_PASSWORD` again.

---

## How sign-in works

- Passwords are stored only as salted scrypt hashes, never as the password itself.
- After sign-in the browser holds a signed, HTTP-only, secure cookie. Every page and API call checks it,
  and also checks that the person still has access.
- Failed sign-ins are slowed down. There's no self sign-up: only an admin can add people.
