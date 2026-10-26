{{ config(tags=['sheets']) }}
-- What the three files were built from: the real November 2011 lines, numbered the same way.
select
    region,
    invoice,
    cast(row_number() over (partition by invoice order by source_sheet, source_row) as integer) as line,
    invoiced_at,
    stock_code,
    quantity,
    unit_price,
    customer_id,
    country
from {{ ref('fct_retail_lines') }}
where month_start = date '2011-11-01'
