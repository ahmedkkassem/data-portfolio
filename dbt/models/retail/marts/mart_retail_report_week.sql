-- Facts for the "Monday Report" email: the last complete week vs the week before and the same week last year.
with weeks as (
    select * from {{ ref('mart_retail_weekly') }}
),

report as (
    select max(week_start) as week_start from weeks where is_complete_week
)

select
    case weeks.week_start
        when report.week_start then 'this_week'
        when report.week_start - 7 then 'last_week'
        when report.week_start - 364 then 'same_week_last_year'
    end as comparison,
    weeks.*,
    weeks.gross_sales / nullif(weeks.orders, 0) as avg_order_value,
    weeks.returns / nullif(weeks.gross_sales, 0) as return_rate
from weeks
cross join report
where weeks.week_start in (report.week_start, report.week_start - 7, report.week_start - 364)
