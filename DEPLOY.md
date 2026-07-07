# Deploying ProvenIQ — Plain-English Guide

This gets ProvenIQ off your computer and running on the internet by itself,
so it emails your team a fresh briefing every morning without you doing
anything.

There are 4 parts. Do them in order. Take your time — none of this is urgent.

---

## Part A — Turn on the email (test it on your computer first)

The app can already score leads and write scripts. The last piece is the
email. It uses a free service called **Resend**.

1. Go to **resend.com** and make a free account.
2. On the left menu, click **API Keys** → **Create API Key**. Copy the code
   (it starts with `re_`).
3. Open your `.env.local` file (ask Claude to open it for you, like we did
   with the Anthropic key).
4. Find the line `RESEND_API_KEY=` and paste your code right after the `=`.
   Save the file.
5. **Verify a "from" address (important):** Resend won't let you email just
   anyone until you prove you own an email domain.
   - **Quick test:** with no setup, Resend can send FROM `onboarding@resend.dev`
     TO the email you signed up with. That's enough to see it working.
   - **Real use:** to email your whole team, go to **Domains** in Resend and
     verify your domain (e.g. `provenrealty.com`). Then set a line in
     `.env.local`: `DIGEST_FROM=ProvenIQ <briefing@provenrealty.com>`.

Once the key is in, Claude can send a test digest and you'll get the email.

---

## Part B — Put the code on GitHub (a safe home for it online)

Vercel (the hosting service) reads your code from GitHub.

1. Make a free account at **github.com**.
2. Click the **+** in the top-right → **New repository**. Name it
   `proveniq`, keep it **Private**, and click **Create repository**.
3. GitHub shows a page with commands. You want the section
   "…or push an existing repository." Claude can run these for you — just
   share the two lines that start with `git remote add origin ...` and
   `git push ...`, or paste the repository URL and ask Claude to push.

That's it — your code now lives safely on GitHub.

---

## Part C — Put it on the internet with Vercel

1. Make a free account at **vercel.com** — sign in **with GitHub** (easiest).
2. Click **Add New… → Project**, find your `proveniq` repo, click **Import**.
3. Before clicking Deploy, open **Environment Variables** and add every line
   from your `.env.local` file (name on the left, value on the right):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `FUB_API_KEY`, `FUB_X_SYSTEM`, `FUB_X_SYSTEM_KEY`
   - `ANTHROPIC_API_KEY`
   - `RESEND_API_KEY` (and `DIGEST_FROM` if you set one)
   - `CRON_SECRET`
   - `APP_URL` — for now put a placeholder; you'll fix it in step 5.
4. Click **Deploy** and wait a couple of minutes. Vercel gives you a web
   address like `https://proveniq.vercel.app`.
5. **Fix APP_URL:** go to your project's **Settings → Environment Variables**,
   change `APP_URL` to your new address (e.g. `https://proveniq.vercel.app`),
   then **Redeploy** (Deployments tab → ⋯ → Redeploy). This makes the links
   in your email point to the live site.

---

## Part D — The nightly robot (already set up)

The file `vercel.json` already tells Vercel to run the whole nightly job at
**10:00 UTC (about 4:00 AM Mountain)** every day: pull new lead activity,
re-score everyone, write fresh scripts, and email the briefing. You don't
have to configure anything — Vercel turns it on automatically when you deploy.

**One thing to know about timing:** the free Vercel plan limits how long a
job can run. The nightly job does a lot (scoring thousands of leads + writing
scripts). If it ever times out, the fix is to upgrade to the Vercel **Pro**
plan (longer time limit), or ask Claude to split the job into smaller pieces.

To test the nightly job by hand any time, you (or Claude) can trigger it:
`POST https://YOUR-SITE/api/cron` with the header
`x-cron-secret: <your CRON_SECRET>`.

---

## Quick reference: what each web address does

- `/login` — sign in
- `/dashboard` — today's ranked briefing
- `/dashboard/<lead id>` — one lead's scripts
- `/admin/sync` — pull data from Follow Up Boss (admins only)
- `/api/cron` — the nightly robot (runs sync → score → scripts → email)
