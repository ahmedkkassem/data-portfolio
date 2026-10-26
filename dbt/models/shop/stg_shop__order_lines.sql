-- The shop's order lines, typed. Money is exact (3 decimals: some unit prices have tenths of a penny).
select
    order_id,
    order_type,
    ordered_at,
    cast(ordered_at as date) as order_date,
    {{ week_start('cast(ordered_at as date)') }} as week_start,
    sku,
    product_title,
    quantity,
    {{ money('unit_price') }} as unit_price,
    {{ money('line_total') }} as line_total,
    customer_id,
    country
from {{ shop_raw() }}
