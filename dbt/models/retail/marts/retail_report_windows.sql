-- The reporting windows every dashboard view uses, anchored on the last complete week.
-- current = the latest N weeks; previous = the N weeks before that.
with anchor as (
    select max(week_end) as end_date from {{ ref('mart_retail_weekly') }} where is_complete_week
),

presets as (
    select * from (values ('4w', 4), ('13w', 13), ('52w', 52)) as t (preset, weeks)
)

select preset, weeks, 'current' as period,
       cast(end_date - (7 * weeks - 1) as date) as start_date, cast(end_date as date) as end_date
from presets cross join anchor
union all
select preset, weeks, 'previous' as period,
       cast(end_date - (14 * weeks - 1) as date) as start_date, cast(end_date - 7 * weeks as date) as end_date
from presets cross join anchor
