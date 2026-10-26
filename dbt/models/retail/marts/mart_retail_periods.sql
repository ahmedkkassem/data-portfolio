-- Headline KPIs for each window. Distinct counts are computed over the whole window (never summed from weeks).
with windows as (
    select * from {{ ref('retail_report_windows') }}
),

lines as (
    select * from {{ ref('fct_retail_lines') }}
),

facts as (
    select
        windows.preset,
        windows.period,
        coalesce(sum(lines.line_amount) filter (where lines.line_kind = 'sale'), 0) as gross_sales,
        coalesce(-sum(lines.line_amount) filter (where lines.line_kind = 'return'), 0) as returns,
        count(distinct lines.invoice) filter (where lines.line_kind = 'sale') as orders,
        coalesce(sum(lines.quantity) filter (where lines.line_kind = 'sale'), 0) as units,
        count(distinct lines.customer_id) filter (where lines.line_kind = 'sale') as active_customers,
        coalesce(sum(lines.line_amount) filter (where lines.country <> 'United Kingdom'), 0) as international_net_revenue
    from windows
    inner join lines on lines.order_date between windows.start_date and windows.end_date
    group by 1, 2
),

new_customers as (
    select windows.preset, windows.period, count(customers.customer_id) as new_customers
    from windows
    left join {{ ref('dim_retail_customers') }} as customers
        on customers.first_order_date between windows.start_date and windows.end_date
    group by 1, 2
),

data_start as (
    select min(order_date) as first_day from lines
)

select
    windows.preset,
    windows.weeks,
    windows.period,
    windows.start_date,
    windows.end_date,
    facts.gross_sales,
    facts.returns,
    facts.gross_sales - facts.returns as net_revenue,
    facts.returns / nullif(facts.gross_sales, 0) as return_rate,
    facts.orders,
    facts.gross_sales / nullif(facts.orders, 0) as avg_order_value,
    facts.units,
    facts.active_customers,
    new_customers.new_customers,
    -- with no history before the data starts, "new" is only meaningful after a year of look-back
    windows.start_date >= data_start.first_day + 365 as new_customers_reliable,
    facts.international_net_revenue / nullif(facts.gross_sales - facts.returns, 0) as international_share
from windows
inner join facts using (preset, period)
inner join new_customers using (preset, period)
cross join data_start
