-- Headline numbers: the last 7 complete days vs the 7 before (24-hour close rate on mature days only).
with b as (select * from {{ ref('nyc311_bounds') }}),
r as (select * from {{ ref('stg_nyc311__requests') }}),
periods as (
    select 'current' as period, last_complete_day - 6 as d0, last_complete_day as d1,
           last_mature_day - 6 as m0, last_mature_day as m1 from b
    union all
    select 'previous', last_complete_day - 13, last_complete_day - 7, last_mature_day - 13, last_mature_day - 7 from b
)
select
    p.period,
    p.d0 as start_day,
    p.d1 as end_day,
    (select count(*) from r where r.created_day between p.d0 and p.d1) as requests,
    (select count(*) filter (where hours_to_close <= 24) / count(*) from r where r.created_day between p.m0 and p.m1)
        as closed_within_24h_rate,
    (select median(hours_to_close) from r where r.created_day between p.m0 and p.m1 and hours_to_close is not null)
        as median_hours_to_close,
    (select count(*) from r where not r.is_closed) as open_now,
    p.m0 as mature_start_day,
    p.m1 as mature_end_day
from periods p
