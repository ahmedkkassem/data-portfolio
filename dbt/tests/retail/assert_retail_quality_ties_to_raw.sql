-- The data-quality summary accounts for every raw row and every pound in the raw file.
with q as (select sum(source_rows) as rows_, sum(amount) as amount from {{ ref('mart_retail_data_quality') }}),
r as (
    select count(*) as rows_, sum(cast(round(price, 3) as decimal(18, 3)) * quantity) as amount
    from {{ source('retail', 'online_retail_ii') }}
)
select * from q cross join r as raw_totals
where q.rows_ <> raw_totals.rows_ or q.amount <> raw_totals.amount
