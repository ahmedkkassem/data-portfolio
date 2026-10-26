-- Agency performance for requests opened in the last 28 complete days: volume and how many are still open,
-- plus close times measured on the 28 latest mature days (every request has had its full 24 hours).
with b as (select * from {{ ref('nyc311_bounds') }}),
r as (select * from {{ ref('stg_nyc311__requests') }})
select
    r.agency,
    count(*) filter (where r.created_day between b.last_complete_day - 27 and b.last_complete_day) as requests_28d,
    count(*) filter (where r.created_day between b.last_mature_day - 27 and b.last_mature_day and r.hours_to_close <= 24)
        / nullif(count(*) filter (where r.created_day between b.last_mature_day - 27 and b.last_mature_day), 0) as closed_within_24h_rate,
    median(r.hours_to_close) filter (where r.created_day between b.last_mature_day - 27 and b.last_mature_day) as median_hours_to_close,
    count(*) filter (where r.created_day between b.last_complete_day - 27 and b.last_complete_day and not r.is_closed) as open_now
from r cross join b
group by r.agency
having count(*) filter (where r.created_day between b.last_complete_day - 27 and b.last_complete_day) > 0
order by requests_28d desc
