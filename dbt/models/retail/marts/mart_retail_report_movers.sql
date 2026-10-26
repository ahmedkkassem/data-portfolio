-- Product and country movers for the report week vs the week before (net revenue).
with report as (
    select max(week_start) as week_start from {{ ref('mart_retail_weekly') }} where is_complete_week
),

lines as (
    select lines.*, report.week_start as report_week
    from {{ ref('fct_retail_lines') }} as lines
    cross join report
    where lines.week_start in (report.week_start, report.week_start - 7)
),

by_product as (
    select
        'product' as dimension,
        stock_code as key,
        any_value(product_description) as label,
        coalesce(sum(line_amount) filter (where week_start = report_week), 0) as this_week,
        coalesce(sum(line_amount) filter (where week_start = report_week - 7), 0) as last_week
    from lines
    group by stock_code
),

by_country as (
    select
        'country' as dimension,
        country as key,
        country as label,
        coalesce(sum(line_amount) filter (where week_start = report_week), 0) as this_week,
        coalesce(sum(line_amount) filter (where week_start = report_week - 7), 0) as last_week
    from lines
    group by country
),

by_day as (
    select
        'day' as dimension,
        cast(order_date as varchar) as key,
        dayname(order_date) as label,
        sum(line_amount) as this_week,
        null as last_week
    from lines
    where week_start = report_week
    group by order_date
)

select *, this_week - last_week as change from by_product
union all
select *, this_week - last_week as change from by_country
union all
select *, null as change from by_day
