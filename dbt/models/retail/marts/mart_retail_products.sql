-- Net revenue by product for each window (current, previous and last year), for top lists and movers.
select
    windows.preset,
    windows.period,
    lines.stock_code,
    any_value(lines.product_description) as product_description,
    sum(lines.line_amount) as net_revenue,
    coalesce(sum(lines.quantity) filter (where lines.line_kind = 'sale'), 0) as units,
    count(distinct lines.invoice) filter (where lines.line_kind = 'sale') as orders
from {{ ref('retail_report_windows') }} as windows
inner join {{ ref('fct_retail_lines') }} as lines
    on lines.order_date between windows.start_date and windows.end_date
group by all
