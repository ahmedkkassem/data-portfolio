-- The rebuilt spreadsheet lines, typed.
select
    source_file,
    region,
    invoice,
    cast(line as integer) as line,
    cast(invoiced_at as timestamp) as invoiced_at,
    stock_code,
    cast(quantity as integer) as quantity,
    cast(unit_price as decimal(18, 3)) as unit_price,
    customer_id,
    country
from {{ source('sheets', 'sheets_clean') }}
