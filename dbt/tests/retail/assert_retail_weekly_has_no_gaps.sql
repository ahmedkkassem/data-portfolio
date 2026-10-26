-- The weekly table is a continuous calendar: one row per week from the first to the last week of data.
select count(*) as weeks, count(distinct week_start) as distinct_weeks,
       datediff('day', min(week_start), max(week_start)) / 7 + 1 as expected
from {{ ref('mart_retail_weekly') }}
having count(*) <> datediff('day', min(week_start), max(week_start)) / 7 + 1
    or count(distinct week_start) <> count(*)
