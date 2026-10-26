{{ config(severity='warn') }}
-- Warn when the latest complete day's volume is far outside the trailing 28-day median (possible partial load).
with d as (select * from {{ ref('mart_nyc311_daily') }}),
last_day as (select * from d order by day desc limit 1),
baseline as (select median(requests) as med from (select * from d order by day desc limit 29 offset 1))
select last_day.day, last_day.requests, baseline.med
from last_day cross join baseline
where last_day.requests < 0.5 * baseline.med or last_day.requests > 2 * baseline.med
