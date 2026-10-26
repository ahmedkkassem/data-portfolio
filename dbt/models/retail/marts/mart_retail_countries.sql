-- Net revenue by country for each current window.
select
    windows.preset,
    lines.country,
    lines.region,
    sum(lines.line_amount) as net_revenue,
    count(distinct lines.invoice) filter (where lines.line_kind = 'sale') as orders,
    count(distinct lines.customer_id) filter (where lines.line_kind = 'sale') as customers
from {{ ref('retail_report_windows') }} as windows
inner join {{ ref('fct_retail_lines') }} as lines
    on lines.order_date between windows.start_date and windows.end_date
where windows.period = 'current'
group by all
