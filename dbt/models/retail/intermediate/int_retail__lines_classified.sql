-- Every source line, with the single reason it is excluded from sales reporting (null = included).
-- Rules come from profiling the raw file (tools/profile_retail.py):
--   * the 2009-2010 sheet repeats 1-9 Dec 2010, which the 2010-2011 sheet also holds (identical rows; see tests)
--   * exact repeated lines (same invoice, product, qty, price, timestamp, customer) are counted once
--   * postage, fees, manual adjustments, discounts, samples, vouchers and test items are not product sales
--   * zero/negative prices and lines whose quantity sign contradicts the invoice type are not sales
with lines as (
    select * from {{ ref('stg_retail__lines') }}
),

second_sheet_start as (
    select min(invoiced_at) as starts_at
    from lines
    where source_sheet = 'Year 2010-2011'
),

flagged as (
    select
        lines.*,
        lines.source_sheet = 'Year 2009-2010' and lines.invoiced_at >= second_sheet_start.starts_at as is_overlap_copy,
        md5(concat_ws('|',
            lines.invoice, lines.stock_code_raw, coalesce(lines.description, ''), cast(lines.quantity as varchar),
            cast(lines.invoiced_at as varchar), cast(lines.unit_price as varchar),
            coalesce(lines.customer_id, ''), lines.source_country)) as line_fingerprint
    from lines
    cross join second_sheet_start
),

ranked as (
    select
        *,
        row_number() over (
            partition by line_fingerprint, is_overlap_copy
            order by source_sheet, source_row
        ) as copy_number
    from flagged
),

non_product as (
    select stock_code, category from {{ ref('retail_non_product_codes') }} where stock_code <> 'GIFT_*'
)

select
    ranked.*,
    coalesce(non_product.category, case when starts_with(ranked.stock_code, 'GIFT_') then 'gift_voucher' end)
        as non_product_category,
    case
        when ranked.is_overlap_copy then 'overlap_copy'
        when ranked.copy_number > 1 then 'exact_duplicate'
        when non_product.category is not null or starts_with(ranked.stock_code, 'GIFT_') then 'non_product'
        when ranked.unit_price <= 0 then 'zero_or_negative_price'
        when ranked.quantity = 0 then 'zero_quantity'
        when starts_with(ranked.invoice, 'C') and ranked.quantity > 0 then 'quantity_sign_mismatch'
        when not starts_with(ranked.invoice, 'C') and ranked.quantity < 0 then 'quantity_sign_mismatch'
    end as exclusion_reason
from ranked
left join non_product on non_product.stock_code = ranked.stock_code
