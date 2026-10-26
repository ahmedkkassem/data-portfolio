-- One row per line of the source workbook: typed and trimmed, nothing dropped.
select
    source_sheet,
    source_row,
    trim(invoice) as invoice,
    trim(stock_code) as stock_code_raw,
    upper(trim(stock_code)) as stock_code,
    nullif(trim(description), '') as description,
    cast(quantity as integer) as quantity,
    cast(invoice_date as timestamp) as invoiced_at,
    cast(round(price, 3) as decimal(18, 3)) as unit_price,
    case when customer_id is not null then cast(cast(customer_id as bigint) as varchar) end as customer_id,
    trim(country) as source_country
from {{ source('retail', 'online_retail_ii') }}
