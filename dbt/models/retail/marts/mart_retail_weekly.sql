-- One row per Monday-to-Sunday week. Gross sales minus returns = net revenue.
with lines as (
    select * from {{ ref('fct_retail_lines') }}
),

customers as (
    select * from {{ ref('dim_retail_customers') }}
),

bounds as (
    select min(order_date) as first_day, max(order_date) as last_day from lines
),

weekly as (
    select
        week_start,
        coalesce(sum(line_amount) filter (where line_kind = 'sale'), 0) as gross_sales,
        coalesce(-sum(line_amount) filter (where line_kind = 'return'), 0) as returns,
        count(distinct invoice) filter (where line_kind = 'sale') as orders,
        coalesce(sum(quantity) filter (where line_kind = 'sale'), 0) as units,
        count(distinct customer_id) filter (where line_kind = 'sale') as active_customers
    from lines
    group by week_start
),

by_customer_type as (
    select
        lines.week_start,
        coalesce(sum(lines.line_amount) filter (where lines.customer_id is null), 0) as sales_guest,
        coalesce(sum(lines.line_amount) filter (
            where cast(date_trunc('week', customers.first_order_date) as date) = lines.week_start), 0) as sales_new_customers,
        coalesce(sum(lines.line_amount) filter (where customers.first_order_date < lines.week_start), 0)
            as sales_returning_customers
    from lines
    left join customers using (customer_id)
    where lines.line_kind = 'sale'
    group by lines.week_start
),

new_customers as (
    select cast(date_trunc('week', first_order_date) as date) as week_start, count(*) as new_customers
    from customers
    where first_order_date is not null
    group by 1
)

select
    weekly.week_start,
    weekly.week_start + 6 as week_end,
    weekly.week_start >= bounds.first_day and weekly.week_start + 6 <= bounds.last_day as is_complete_week,
    weekly.gross_sales,
    weekly.returns,
    weekly.gross_sales - weekly.returns as net_revenue,
    weekly.orders,
    weekly.units,
    weekly.active_customers,
    coalesce(new_customers.new_customers, 0) as new_customers,
    coalesce(by_customer_type.sales_new_customers, 0) as sales_new_customers,
    coalesce(by_customer_type.sales_returning_customers, 0) as sales_returning_customers,
    coalesce(by_customer_type.sales_guest, 0) as sales_guest
from weekly
cross join bounds
left join by_customer_type using (week_start)
left join new_customers using (week_start)
order by weekly.week_start
