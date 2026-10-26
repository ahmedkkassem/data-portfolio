-- Most common complaint types over the last 28 complete days, by borough.
with b as (select * from {{ ref('nyc311_bounds') }}),
r as (
    select r.* from {{ ref('stg_nyc311__requests') }} r cross join b
    where r.created_day between b.last_complete_day - 27 and b.last_complete_day
)
select
    complaint_type,
    count(*) as requests,
    count(*) filter (where borough = 'Bronx') as bronx,
    count(*) filter (where borough = 'Brooklyn') as brooklyn,
    count(*) filter (where borough = 'Manhattan') as manhattan,
    count(*) filter (where borough = 'Queens') as queens,
    count(*) filter (where borough = 'Staten Island') as staten_island,
    count(*) filter (where borough = 'Unspecified') as unspecified
from r
group by complaint_type
order by requests desc
