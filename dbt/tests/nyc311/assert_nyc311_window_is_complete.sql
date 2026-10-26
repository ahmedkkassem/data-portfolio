-- The rolling window must hold at least 80 days of requests with no empty days (a gap means a failed load).
with d as (select * from {{ ref('mart_nyc311_daily') }})
select count(*) as days, count(*) filter (where requests = 0) as empty_days
from d
having count(*) < 80 or count(*) filter (where requests = 0) > 0
