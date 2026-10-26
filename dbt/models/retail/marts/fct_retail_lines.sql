-- Clean sales lines: one row per product sale or product return that passed every rule.
with included as (
    select * from {{ ref('int_retail__lines_classified') }}
    where exclusion_reason is null
)

select
    included.source_sheet,
    included.source_row,
    included.invoice,
    case when starts_with(included.invoice, 'C') then 'return' else 'sale' end as line_kind,
    included.invoiced_at,
    cast(included.invoiced_at as date) as order_date,
    cast(date_trunc('week', included.invoiced_at) as date) as week_start,
    cast(date_trunc('month', included.invoiced_at) as date) as month_start,
    included.stock_code,
    coalesce(products.description, 'PRODUCT ' || included.stock_code) as product_description,
    included.quantity,
    included.unit_price,
    cast(included.quantity * included.unit_price as decimal(18, 3)) as line_amount,
    included.customer_id,
    coalesce(countries.country, included.source_country) as country,
    coalesce(countries.region, 'Rest of world') as region
from included
left join {{ ref('dim_retail_products') }} as products using (stock_code)
left join {{ ref('retail_country_names') }} as countries on countries.source_country = included.source_country
