-- Requests per complete day, with the trailing 7-day average and the 24-hour close rate for mature days.
with b as (select * from {{ ref('nyc311_bounds') }}),
spine as (
    select cast(unnest(generate_series(first_complete_day, last_complete_day, interval 1 day)) as date) as day from b
),
r as (select * from {{ ref('stg_nyc311__requests') }}),
daily as (
    select
        created_day as day,
        count(*) as requests,
        count(*) filter (where hours_to_close <= 24) as closed_within_24h
    from r group by 1
)
select
    spine.day,
    coalesce(daily.requests, 0) as requests,
    avg(coalesce(daily.requests, 0)) over (order by spine.day rows between 6 preceding and current row) as requests_7d_avg,
    case when spine.day <= b.last_mature_day then daily.closed_within_24h / daily.requests end as closed_within_24h_rate
from spine
cross join b
left join daily using (day)
order by spine.day
