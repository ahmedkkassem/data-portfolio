-- By definition every customer is active in their first month: month-0 retention must be exactly 100%.
select * from {{ ref('mart_retail_cohorts') }}
where month_offset = 0 and active_customers <> cohort_size
