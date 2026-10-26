-- Net revenue and units by product and week, for top lists and week-on-week movers.
select
    week_start,
    sku,
    max(product_title) as product_title,
    sum(line_total) as net_revenue,
    sum(case when order_type = 'sale' then quantity else 0 end) as units,
    count(distinct case when order_type = 'sale' then order_id end) as orders
from {{ ref('stg_shop__order_lines') }}
group by week_start, sku
