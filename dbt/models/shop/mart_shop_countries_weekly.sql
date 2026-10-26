-- Net revenue by country and week.
select
    week_start,
    country,
    sum(line_total) as net_revenue,
    count(distinct case when order_type = 'sale' then order_id end) as orders,
    count(distinct case when order_type = 'sale' then customer_id end) as customers
from {{ ref('stg_shop__order_lines') }}
group by week_start, country
