-- One row per day from the shop's first day to its last day with data; quiet days are zeros, not gaps.
with lines as (
    select * from {{ ref('stg_shop__order_lines') }}
),

bounds as (
    select min(order_date) as first_day, max(order_date) as last_day from lines
),

spine as (
    {{ day_spine('(select first_day from bounds)', '(select last_day from bounds)') }}
),

daily as (
    select
        order_date as day,
        count(distinct case when order_type = 'sale' then order_id end) as orders,
        sum(case when order_type = 'sale' then line_total else 0 end) as gross_sales,
        -sum(case when order_type = 'return' then line_total else 0 end) as returns,
        sum(line_total) as net_revenue,
        sum(case when order_type = 'sale' then quantity else 0 end) as units,
        count(distinct case when order_type = 'sale' then customer_id end) as active_customers
    from lines
    group by order_date
),

new_customers as (
    select first_order_date as day, count(*) as new_customers
    from {{ ref('dim_shop_customers') }}
    where first_order_date is not null
    group by first_order_date
)

select
    spine.day,
    {{ week_start('spine.day') }} as week_start,
    coalesce(daily.orders, 0) as orders,
    coalesce(daily.gross_sales, 0) as gross_sales,
    coalesce(daily.returns, 0) as returns,
    coalesce(daily.net_revenue, 0) as net_revenue,
    coalesce(daily.units, 0) as units,
    coalesce(daily.active_customers, 0) as active_customers,
    coalesce(new_customers.new_customers, 0) as new_customers
from spine
left join daily on daily.day = spine.day
left join new_customers on new_customers.day = spine.day
