{{ config(tags=['sheets']) }}
-- Every rebuilt line must match a real source line field-for-field, and vice versa (no line lost,
-- invented, changed or double-counted).
with rebuilt as (
    select region, invoice, line, invoiced_at, stock_code, quantity, unit_price, customer_id, country
    from {{ ref('stg_sheets__lines') }}
),
truth as (
    select region, invoice, line, invoiced_at, stock_code, quantity, unit_price, customer_id, country
    from {{ ref('int_sheets__truth') }}
)
select 'rebuilt_not_in_source' as side, * from (select * from rebuilt except all select * from truth)
union all
select 'source_not_rebuilt' as side, * from (select * from truth except all select * from rebuilt)
