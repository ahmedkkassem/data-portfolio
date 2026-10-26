-- One row per product code. The display name is the description used most often on included lines
-- (the source spells some products several ways); ties go to the most recent spelling.
with included as (
    select stock_code, upper(description) as description, invoiced_at
    from {{ ref('int_retail__lines_classified') }}
    where exclusion_reason is null
),

spellings as (
    select stock_code, description, count(*) as uses, max(invoiced_at) as last_used
    from included
    where description is not null
    group by all
),

best as (
    select stock_code, description
    from spellings
    qualify row_number() over (partition by stock_code order by uses desc, last_used desc, description) = 1
)

select
    codes.stock_code,
    best.description,
    (select count(*) from spellings s where s.stock_code = codes.stock_code) as spelling_count
from (select distinct stock_code from included) codes
left join best using (stock_code)
