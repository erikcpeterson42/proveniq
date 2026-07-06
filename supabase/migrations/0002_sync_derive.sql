-- ProvenIQ sync support: event de-duplication + touch-time derivation.

-- 1) Let lead_events remember which FUB record it came from, so re-running
--    a sync never creates duplicate rows.
alter table public.lead_events
  add column if not exists fub_id      bigint,
  add column if not exists source_kind text;

create unique index if not exists uq_lead_events_source
  on public.lead_events (source_kind, fub_id)
  where fub_id is not null;

-- 2) Track how long an inbound message has gone unanswered.
alter table public.leads
  add column if not exists unanswered_hours numeric;

-- 3) Recompute last_touch_at (our last OUTBOUND contact), last_inbound_at
--    (lead's last INBOUND message), and unanswered_hours from lead_events.
create or replace function public.recompute_lead_touch()
returns void
language sql
security definer
set search_path = public
as $$
  with agg as (
    select
      lead_id,
      max(occurred_at) filter (
        where type in ('text_in', 'inquiry')
           or (type = 'call' and payload ->> 'direction' = 'inbound')
      ) as inbound,
      max(occurred_at) filter (
        where type = 'text_out'
           or (type = 'call' and payload ->> 'direction' = 'outbound')
      ) as outbound
    from public.lead_events
    group by lead_id
  )
  update public.leads l set
    last_inbound_at  = agg.inbound,
    last_touch_at    = agg.outbound,
    unanswered_hours = case
      when agg.inbound is not null
       and (agg.outbound is null or agg.inbound > agg.outbound)
      then round(extract(epoch from (now() - agg.inbound)) / 3600.0, 1)
      else null
    end
  from agg
  where agg.lead_id = l.id;
$$;
