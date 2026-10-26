-- One row per identified customer; guest orders carry no customer ID.
select
    customer_id,
    min(case when order_type = 'sale' then order_date end) as first_order_date,
    max(case when order_type = 'sale' then order_date end) as last_order_date,
    count(distinct case when order_type = 'sale' then order_id end) as orders,
    sum(line_total) as net_revenue
from {{ ref('stg_shop__order_lines') }}
where customer_id is not null
group by customer_id
