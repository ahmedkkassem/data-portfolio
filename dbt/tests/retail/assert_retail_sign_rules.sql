-- Sales are positive quantities, returns negative, and every price is positive.
select *
from {{ ref('fct_retail_lines') }}
where unit_price <= 0
   or (line_kind = 'sale' and quantity <= 0)
   or (line_kind = 'return' and quantity >= 0)
