-- Where every source line went. Rows here add up to the raw file exactly (tested).
select
    coalesce(exclusion_reason, 'included') as outcome,
    non_product_category,
    count(*) as source_rows,
    sum(quantity * unit_price) as amount
from {{ ref('int_retail__lines_classified') }}
group by all
order by source_rows desc
