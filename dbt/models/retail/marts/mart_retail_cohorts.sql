-- Monthly retention: of the customers who first bought in month M, the share who bought again k months later.
-- Only complete months are used (the data stops on 9 Dec 2011).
with lines as (
    select * from {{ ref('fct_retail_lines') }}
),

last_complete_month as (
    select cast(date_trunc('month', max(order_date) + 1) - interval 1 month as date) as month_start from lines
),

cohorts as (
    select customer_id, cast(date_trunc('month', first_order_date) as date) as cohort_month
    from {{ ref('dim_retail_customers') }}
    where first_order_date is not null
),

activity as (
    select distinct lines.customer_id, lines.month_start
    from lines
    cross join last_complete_month
    where lines.line_kind = 'sale' and lines.customer_id is not null
        and lines.month_start <= last_complete_month.month_start
),

sizes as (
    select cohort_month, count(*) as cohort_size from cohorts group by 1
)

select
    cohorts.cohort_month,
    cast(datediff('month', cohorts.cohort_month, activity.month_start) as integer) as month_offset,
    count(distinct activity.customer_id) as active_customers,
    sizes.cohort_size,
    count(distinct activity.customer_id) / sizes.cohort_size as retention
from cohorts
inner join activity using (customer_id)
inner join sizes using (cohort_month)
cross join last_complete_month
where cohorts.cohort_month <= last_complete_month.month_start
group by cohorts.cohort_month, month_offset, sizes.cohort_size
