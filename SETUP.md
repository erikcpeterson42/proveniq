# ProvenIQ — Setup Guide

Plain-English steps to get the app running. Do these in order.

## 1. Install Node.js

Node is the engine that runs the app. Install the LTS version from
<https://nodejs.org>. After installing, open a new terminal and confirm:

```
node --version
npm --version
```

## 2. Install the code libraries

From the project folder:

```
npm install
```

This downloads everything listed in `package.json` into a `node_modules`
folder (not committed to git — it's re-downloadable).

## 3. Create a Supabase project

1. Go to <https://supabase.com> and create a free project.
2. In **Project Settings > API**, copy:
   - Project URL
   - `anon` public key
   - `service_role` secret key

## 4. Add your secrets

Copy `.env.example` to `.env.local` and paste in the values:

```
cp .env.example .env.local
```

Fill in at least the three Supabase values to log in. The FUB, Anthropic,
Resend, and Cron values are needed later for scoring/sync/email.

## 5. Create the database tables

Open the Supabase Dashboard > **SQL Editor**, paste the contents of
`supabase/migrations/0001_init.sql`, and click **Run**. This creates all
tables and security rules.

(Advanced: if you use the Supabase CLI, `supabase db push` applies
migrations and `supabase db reset` also runs `supabase/seed.sql`.)

## 6. Create your first login

Since signup is invite-only, create a user by hand:

- Supabase Dashboard > **Authentication > Users > Add user**
- Enter an email + password, and check **Auto Confirm User**.
- To make them an admin: Dashboard > **Table Editor > profiles**, find the
  row, and set `role` to `admin`.

(A profile row is created automatically for every new user.)

## 7. Run the app

```
npm run dev
```

Open <http://localhost:3000>. You should be redirected to `/login`. Sign in
with the user you created and you'll land on the ProvenIQ dashboard.

## Everyday commands

| Command         | What it does                                  |
| --------------- | --------------------------------------------- |
| `npm run dev`   | Run the app locally while you work            |
| `npm run build` | Check the whole app compiles (no errors)      |
| `npm start`     | Run the built app (after `npm run build`)     |
| `npm run lint`  | Check code style                              |
