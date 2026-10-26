-- Per team: lines and net revenue in the source vs rebuilt from the messy files.
with truth as (
    select region, count(*) as source_lines, sum(quantity * unit_price) as source_net_revenue
    from {{ ref('int_sheets__truth') }} group by region
),
rebuilt as (
    select region, count(*) as rebuilt_lines, sum(quantity * unit_price) as rebuilt_net_revenue
    from {{ ref('stg_sheets__lines') }} group by region
)
select
    region,
    truth.source_lines,
    rebuilt.rebuilt_lines,
    truth.source_net_revenue,
    rebuilt.rebuilt_net_revenue,
    truth.source_lines = rebuilt.rebuilt_lines and truth.source_net_revenue = rebuilt.rebuilt_net_revenue as matches
from truth
full outer join rebuilt using (region)
order by truth.source_lines desc
