-- Fails if the daily table skips a calendar day between its first and last day.
select count(*) as days, min(day) as first_day, max(day) as last_day
from {{ ref('mart_shop_daily') }}
having count(*) <> {{ days_between('min(day)', 'max(day)') }} + 1
