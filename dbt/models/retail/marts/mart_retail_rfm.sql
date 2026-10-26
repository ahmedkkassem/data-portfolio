-- RFM segments with fixed, explainable thresholds (no quantile ties, so results are deterministic).
-- Recency score: <=30 days 5 | <=90 4 | <=180 3 | <=365 2 | older 1
-- Frequency score: 10+ orders 5 | 5-9 4 | 3-4 3 | 2 2 | 1 1
with as_of as (
    select max(order_date) as as_of_date from {{ ref('fct_retail_lines') }}
),

scored as (
    select
        customers.customer_id,
        customers.net_revenue,
        customers.orders,
        cast(as_of.as_of_date - customers.last_order_date as integer) as recency_days,
        case
            when as_of.as_of_date - customers.last_order_date <= 30 then 5
            when as_of.as_of_date - customers.last_order_date <= 90 then 4
            when as_of.as_of_date - customers.last_order_date <= 180 then 3
            when as_of.as_of_date - customers.last_order_date <= 365 then 2
            else 1
        end as r_score,
        case
            when customers.orders >= 10 then 5
            when customers.orders >= 5 then 4
            when customers.orders >= 3 then 3
            when customers.orders = 2 then 2
            else 1
        end as f_score
    from {{ ref('dim_retail_customers') }} as customers
    cross join as_of
    where customers.first_order_date is not null
),

segmented as (
    select
        *,
        case
            when r_score >= 4 and f_score >= 4 then 'Champions'
            when r_score >= 3 and f_score >= 3 then 'Loyal'
            when r_score >= 4 then 'Recent, low frequency'
            when r_score = 3 then 'Needs attention'
            when f_score >= 3 then 'At risk'
            else 'Hibernating'
        end as segment
    from scored
)

select
    segment,
    case segment
        when 'Champions' then 1 when 'Loyal' then 2 when 'Recent, low frequency' then 3
        when 'Needs attention' then 4 when 'At risk' then 5 else 6
    end as segment_order,
    count(*) as customers,
    sum(net_revenue) as net_revenue,
    count(*) / sum(count(*)) over () as customer_share,
    sum(net_revenue) / sum(sum(net_revenue)) over () as revenue_share,
    median(recency_days) as median_recency_days,
    avg(orders) as avg_orders,
    sum(net_revenue) / count(*) as revenue_per_customer
from segmented
group by segment
order by segment_order
