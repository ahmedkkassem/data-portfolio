-- One row per Monday-to-Sunday week. Distinct counts are taken over the whole week (never summed from days).
-- Gross sales are split by who bought: a customer's first-ever week, a returning customer, or a guest.
with lines as (
    select * from {{ ref('stg_shop__order_lines') }}
),

customers as (
    select customer_id, {{ week_start('first_order_date') }} as first_week from {{ ref('dim_shop_customers') }}
),

days as (
    select week_start, count(*) as days_with_data, sum(new_customers) as new_customers
    from {{ ref('mart_shop_daily') }}
    group by week_start
),

weekly as (
    select
        lines.week_start,
        count(distinct case when lines.order_type = 'sale' then lines.order_id end) as orders,
        sum(case when lines.order_type = 'sale' then lines.line_total else 0 end) as gross_sales,
        -sum(case when lines.order_type = 'return' then lines.line_total else 0 end) as returns,
        sum(lines.line_total) as net_revenue,
        sum(case when lines.order_type = 'sale' then lines.quantity else 0 end) as units,
        count(distinct case when lines.order_type = 'sale' then lines.customer_id end) as active_customers,
        sum(case when lines.order_type = 'sale' and lines.customer_id is null then lines.line_total else 0 end) as sales_guest,
        sum(case when lines.order_type = 'sale' and customers.first_week = lines.week_start then lines.line_total else 0 end)
            as sales_new_customers,
        sum(case when lines.order_type = 'sale' and customers.first_week < lines.week_start then lines.line_total else 0 end)
            as sales_returning_customers
    from lines
    left join customers on customers.customer_id = lines.customer_id
    group by lines.week_start
),

this_year as (
    select
        days.week_start,
        {{ add_days('days.week_start', 6) }} as week_end,
        days.days_with_data = 7 as is_complete_week,
        coalesce(weekly.orders, 0) as orders,
        coalesce(weekly.gross_sales, 0) as gross_sales,
        coalesce(weekly.returns, 0) as returns,
        coalesce(weekly.net_revenue, 0) as net_revenue,
        coalesce(weekly.units, 0) as units,
        coalesce(weekly.active_customers, 0) as active_customers,
        days.new_customers,
        coalesce(weekly.sales_new_customers, 0) as sales_new_customers,
        coalesce(weekly.sales_returning_customers, 0) as sales_returning_customers,
        coalesce(weekly.sales_guest, 0) as sales_guest
    from days
    left join weekly on weekly.week_start = days.week_start
)

select
    this_year.*,
    case when this_year.orders > 0 then this_year.gross_sales / this_year.orders end as avg_order_value,
    case when this_year.gross_sales > 0 then this_year.returns / this_year.gross_sales end as return_rate,
    last_year.net_revenue as net_revenue_last_year,
    last_year.orders as orders_last_year
from this_year
left join this_year as last_year on last_year.week_start = {{ add_days('this_year.week_start', -364) }}
