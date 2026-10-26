-- The rows dropped as overlap copies must exist, identically, in the 2010-2011 sheet (both directions).
with dropped as (
    select invoice, stock_code_raw, description, quantity, invoiced_at, unit_price, customer_id, source_country
    from {{ ref('int_retail__lines_classified') }}
    where is_overlap_copy
),
kept as (
    select invoice, stock_code_raw, description, quantity, invoiced_at, unit_price, customer_id, source_country
    from {{ ref('int_retail__lines_classified') }}
    where source_sheet = 'Year 2010-2011'
      and invoiced_at <= (select max(invoiced_at) from {{ ref('int_retail__lines_classified') }} where is_overlap_copy)
)
select 'dropped_not_kept' as side, * from (select * from dropped except all select * from kept)
union all
select 'kept_not_dropped' as side, * from (select * from kept except all select * from dropped)
