-- One-time backfill: copy each lead's home address out of the raw FUB blob
-- into the address columns added by 0003, so Deal Radar can qualify the
-- existing ~12.7k leads immediately (new/changed leads are handled by the
-- nightly sync going forward). Prefers the address typed "home", matching
-- homeAddress() in lib/fub/map.ts. Safe to run more than once.

with addr as (
  select distinct on (l.id)
         l.id, a.street, a.city, a.state, a.code
  from public.leads l
  cross join lateral jsonb_to_recordset(
    case when jsonb_typeof(l.raw -> 'addresses') = 'array'
         then l.raw -> 'addresses' else '[]'::jsonb end
  ) as a(street text, city text, state text, code text, type text)
  where a.street is not null and btrim(a.street) <> ''
  order by l.id, (lower(coalesce(a.type, '')) = 'home') desc
)
update public.leads l
set address_street = addr.street,
    address_state  = addr.state,
    address_zip    = addr.code,
    city           = coalesce(addr.city, l.city)
from addr
where addr.id = l.id;
