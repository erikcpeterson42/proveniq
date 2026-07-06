-- ProvenIQ initial schema
-- Creates all core tables, the profiles/auth glue, and Row Level
-- Security (RLS): authenticated users may READ everything; only the
-- service role (used by server cron/sync/scoring jobs) may WRITE.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles: one row per team member, linked to Supabase Auth users.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'agent' check (role in ('admin', 'agent')),
  created_at timestamptz not null default now()
);

-- Auto-create a profile whenever a new auth user is invited.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', null))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- leads: one row per Follow Up Boss person (id = FUB person id).
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id               bigint primary key,
  name             text,
  first_name       text,
  email            text,
  phone            text,
  lead_type        text check (lead_type in ('buyer', 'seller')),
  stage            text,
  source           text,
  assigned_agent   text,
  tags             jsonb not null default '[]'::jsonb,
  fub_created_at   timestamptz,
  last_activity_at timestamptz,
  last_touch_at    timestamptz, -- our last OUTBOUND contact
  last_inbound_at  timestamptz, -- lead's last INBOUND message
  price_range      text,
  city             text,
  raw              jsonb,
  synced_at        timestamptz not null default now()
);

create index if not exists idx_leads_lead_type on public.leads (lead_type);
create index if not exists idx_leads_assigned_agent on public.leads (assigned_agent);

-- ---------------------------------------------------------------------------
-- lead_events: activity timeline per lead (views, calls, texts, etc.).
-- ---------------------------------------------------------------------------
create table if not exists public.lead_events (
  id          bigserial primary key,
  lead_id     bigint not null references public.leads (id) on delete cascade,
  type        text not null check (type in (
                'property_view', 'inquiry', 'saved_property',
                'email_open', 'email_click', 'text_in', 'text_out',
                'call', 'note', 'website_visit'
              )),
  occurred_at timestamptz not null,
  payload     jsonb
);

create index if not exists idx_lead_events_lead_occurred
  on public.lead_events (lead_id, occurred_at);

-- ---------------------------------------------------------------------------
-- lead_scores: nightly score per lead per run date.
-- ---------------------------------------------------------------------------
create table if not exists public.lead_scores (
  lead_id             bigint not null references public.leads (id) on delete cascade,
  run_date            date not null,
  score               int check (score between 1 and 100),
  likelihood          numeric,
  timeline_bucket     text,
  best_contact_window text,
  next_action         text,
  reasons             jsonb,
  motivation          text,
  pain_points         jsonb,
  is_hot              boolean not null default false,
  is_gem              boolean not null default false,
  is_overdue          boolean not null default false,
  overdue_detail      text,
  score_breakdown     jsonb,
  primary key (lead_id, run_date)
);

create index if not exists idx_lead_scores_run_date_score
  on public.lead_scores (run_date, score desc);

-- ---------------------------------------------------------------------------
-- lead_scripts: nightly generated outreach scripts per lead per run date.
-- ---------------------------------------------------------------------------
create table if not exists public.lead_scripts (
  lead_id       bigint not null references public.leads (id) on delete cascade,
  run_date      date not null,
  call_script   jsonb,
  text_script   text,
  voicemail     text,
  email_subject text,
  email_body    text,
  objections    jsonb,
  primary key (lead_id, run_date)
);

-- ---------------------------------------------------------------------------
-- sync_state: cursor / watermark storage for incremental FUB syncs.
-- ---------------------------------------------------------------------------
create table if not exists public.sync_state (
  key   text primary key,
  value jsonb
);

-- ---------------------------------------------------------------------------
-- settings: single-row configuration for scoring + digest.
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  id                boolean primary key default true,
  scoring_weights   jsonb not null default '{}'::jsonb,
  hot_touch_days    int not null default 1,
  warm_touch_days   int not null default 3,
  digest_recipients jsonb not null default '[]'::jsonb,
  top_n             int not null default 15,
  updated_at        timestamptz not null default now(),
  constraint settings_singleton check (id) -- only one row, id = true
);

insert into public.settings (id) values (true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Service role bypasses RLS automatically, so it can always write.
-- We only add SELECT policies for authenticated users (read-only).
-- ---------------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.leads        enable row level security;
alter table public.lead_events  enable row level security;
alter table public.lead_scores  enable row level security;
alter table public.lead_scripts enable row level security;
alter table public.sync_state   enable row level security;
alter table public.settings     enable row level security;

create policy "authenticated read profiles"
  on public.profiles for select to authenticated using (true);
create policy "authenticated read leads"
  on public.leads for select to authenticated using (true);
create policy "authenticated read lead_events"
  on public.lead_events for select to authenticated using (true);
create policy "authenticated read lead_scores"
  on public.lead_scores for select to authenticated using (true);
create policy "authenticated read lead_scripts"
  on public.lead_scripts for select to authenticated using (true);
create policy "authenticated read sync_state"
  on public.sync_state for select to authenticated using (true);
create policy "authenticated read settings"
  on public.settings for select to authenticated using (true);
