-- The reporting calendar. Data is published with a lag, so the newest day is usually partial:
-- "complete" days end the day before the newest created timestamp, and the 24-hour close rate is only
-- measured for days at least two days old (every request had its full 24 hours).
select
    cast(min(created_at) as date) + 1 as first_complete_day,
    cast(max(created_at) as date) - 1 as last_complete_day,
    cast(max(created_at) as date) - 2 as last_mature_day,
    max(created_at) as data_current_to
from {{ ref('stg_nyc311__requests') }}
