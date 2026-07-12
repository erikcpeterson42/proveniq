-- Deal Radar / automated valuation reports.
-- One row per generated report. Reports are public via an unguessable token
-- (the client opens /r/<token>); everything else stays behind team auth.

-- 1) Capture the full address FUB gives us (0001 only stored city).
alter table public.leads
  add column if not exists address_street text,
  add column if not exists address_state  text,
  add column if not exists address_zip    text;

-- 2) The reports themselves.
create table if not exists public.valuation_reports (
  id           uuid primary key default gen_random_uuid(),
  lead_id      bigint not null references public.leads (id) on delete cascade,
  -- Unguessable public URL token (no auth on the report page).
  token        text not null unique default replace(gen_random_uuid()::text, '-', ''),

  run_kind     text not null check (run_kind in
                 ('daily_new', 'monday_backlog', 'quarterly_refresh', 'manual')),
  status       text not null default 'pending' check (status in
                 ('pending',  -- created, not yet processed
                  'sent',     -- emailed to the client
                  'held',     -- generated but waiting on agent review
                  'skipped',  -- intentionally not generated (see hold_reason)
                  'failed')),
  -- Why a report is held/skipped instead of sent.
  hold_reason  text check (hold_reason in
                 ('address_only',     -- homeowner but no seller tag -> review first
                  'listed_elsewhere', -- active listing w/ another brokerage: NEVER auto-email
                  'thin_data',        -- too few comps / wide spread for a client-facing report
                  'no_data',          -- data source found nothing for this address
                  'api_budget',       -- monthly RentCast budget exhausted
                  'no_email',         -- report ready but the lead has no email on file
                  'needs_address')),  -- seller tag but no address on file

  address_street    text,
  address_city      text,
  address_state     text,
  address_zip       text,
  address_formatted text,

  value_low    numeric,
  value_high   numeric,
  value_best   numeric,
  confidence   text check (confidence in ('high', 'medium', 'low')),

  property     jsonb, -- beds/baths/sqft/year built/last sale, from the data source
  comps        jsonb, -- comparable sales used for the range
  market       jsonb, -- zip-level market stats
  narrative    jsonb, -- AI-written report sections
  listing      jsonb, -- the ACTIVE listing if this home is on the market (ethics guard)
  zillow_url   text,  -- deep link for the TEAM digest (never scraped)
  data_source  text not null default 'rentcast',

  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  first_opened_at timestamptz,
  last_opened_at  timestamptz,
  open_count      int not null default 0,
  refresh_due_at  timestamptz, -- quarterly refresh scheduling
  error           text
);

create index if not exists idx_valuation_reports_lead on public.valuation_reports (lead_id, created_at desc);
create index if not exists idx_valuation_reports_status on public.valuation_reports (status);
create index if not exists idx_valuation_reports_refresh on public.valuation_reports (refresh_due_at)
  where refresh_due_at is not null;

-- 3) Report opens flow into lead_events so the scoring engine can weigh them
--    as an engagement signal ("they just checked their home value" = motivated).
alter table public.lead_events drop constraint if exists lead_events_type_check;
alter table public.lead_events add constraint lead_events_type_check check (type in (
  'property_view', 'inquiry', 'saved_property',
  'email_open', 'email_click', 'text_in', 'text_out',
  'call', 'note', 'website_visit', 'report_open'
));

-- 4) RLS: same model as everything else — team reads, service role writes.
--    The public report page renders server-side with the service role, so
--    no anonymous policy is needed.
alter table public.valuation_reports enable row level security;
create policy "authenticated read valuation_reports"
  on public.valuation_reports for select to authenticated using (true);
