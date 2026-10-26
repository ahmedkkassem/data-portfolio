-- Weekly net revenue adds up to the clean lines to the penny, and the customer-type split adds up to gross sales.
with w as (
    select sum(net_revenue) as weekly_net,
           sum(gross_sales) as weekly_gross,
           sum(sales_new_customers + sales_returning_customers + sales_guest) as split_total
    from {{ ref('mart_retail_weekly') }}
),
l as (
    select sum(line_amount) as line_net,
           sum(line_amount) filter (where line_kind = 'sale') as line_gross
    from {{ ref('fct_retail_lines') }}
)
select * from w cross join l
where weekly_net <> line_net or weekly_gross <> line_gross or split_total <> line_gross
