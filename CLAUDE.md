# ProvenIQ

An AI lead-motivation engine for the **Proven Realty** team (brokered by eXp, western North Dakota). It is a clone of **BirdDog AI**. It connects to our **Follow Up Boss (FUB)** CRM (~8,600 leads, 5–15 team users), scores every lead **1–100 nightly** for motivation to transact soon, and produces a **daily ranked briefing** with personalized outreach scripts.

## Stack

- **Next.js 14+** (App Router, TypeScript strict) + **Tailwind**
- **Supabase** — Postgres + Supabase Auth for team logins
- **Vercel** hosting; **Vercel Cron** runs the nightly scoring job
- **Anthropic Claude API** for AI analysis (server-side only)
- **Resend** for the daily email digest

## Architecture & Conventions

- **TypeScript strict** everywhere.
- **All scoring logic lives in `/lib/scoring`** as **pure, unit-testable functions** — no I/O, no side effects. Deterministic inputs → deterministic outputs.
- **All FUB API access goes through one client in `/lib/fub`** with built-in rate limiting and retry. Never call FUB from anywhere else.
- **Never call the Anthropic API from the browser.** All Claude calls are server-side (route handlers, cron jobs, server actions).
- **Secrets only in env vars.** Never hardcode keys or commit them.
- **Keep files under 300 lines.** Split when they grow past that.
- Use the latest, most capable Claude models for AI analysis.

## Follow Up Boss (FUB) API

- Base URL: `https://api.followupboss.com/v1`
- **Auth:** HTTP Basic — API key as the username, blank password.
- Docs: `docs.followupboss.com` — **verify exact endpoint names and response shapes against the docs before coding.**
- **Rate limiting:** sliding **10-second window**. Always read and respect the `X-RateLimit-*` response headers and **back off on 429s**. The `/lib/fub` client owns this logic.
- **Pagination:** use `limit` / `offset`.

### Key resources

- `/people` — contacts (tags, stage, source, assignedTo, lastActivity)
- `/events` — website + IDX activity (property views, inquiries, saved searches)
- `/calls`
- `/textMessages`
- `/notes`
- `/emailEvents` — opens / clicks

> Endpoint names above are from context — **confirm against docs.followupboss.com before implementing.**

### Our FUB tag conventions (tags encode intent)

- `cash_offer=yes`
- `timeline=within 90 days` / `within 6 months` / `over 6 months`
- `YPRIORITY` — priority flag
- seller / buyer type tags

Leads are **sellers** or **buyers**. **Sellers are our primary focus.**

## The Per-Lead Output Contract

Every phase of the system builds toward producing this object per lead:

- **`score`** — 1–100
- **`likelihood_pct`**
- **`timeline_bucket`** — `0-30` / `30-90` / `90-180` / `180+` days
- **`best_contact_window`** — derived from the lead's historical engagement timestamps
- **`lead_type`** — `buyer` / `seller`
- **`next_action`** — one imperative line
- **`reasons[]`** — "why they're here" signals
- **`motivation`** — one sentence
- **`pain_points[]`**
- **`overdue`** — days since last touch vs. a **hot = 1 day / warm = 3 day** standard, plus **"unanswered inbound message"** detection
- **`scripts`** — object containing:
  - call framework
  - text
  - voicemail
  - email (subject + body)
  - `objections[]` — each with a rebuttal

## Domain Notes

- The nightly Vercel Cron job scores all leads and generates the daily briefing; Resend delivers the digest.
- Scoring must be reproducible and testable — keep the AI-assisted parts and the deterministic parts cleanly separated so `/lib/scoring` stays unit-testable.
