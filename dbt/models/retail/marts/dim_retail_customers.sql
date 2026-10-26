-- One row per identified customer (lines without a customer ID are guest checkouts).
select
    customer_id,
    min(order_date) filter (where line_kind = 'sale') as first_order_date,
    max(order_date) filter (where line_kind = 'sale') as last_order_date,
    count(distinct invoice) filter (where line_kind = 'sale') as orders,
    sum(line_amount) as net_revenue,
    mode(country) as country
from {{ ref('fct_retail_lines') }}
where customer_id is not null
group by customer_id
