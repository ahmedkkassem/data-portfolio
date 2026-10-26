-- Fails if the daily or weekly totals differ from the order lines by even a tenth of a penny.
with l as (select sum(line_total) as net, count(distinct case when order_type = 'sale' then order_id end) as orders
           from {{ ref('stg_shop__order_lines') }}),
     d as (select sum(net_revenue) as net, sum(orders) as orders from {{ ref('mart_shop_daily') }}),
     w as (select sum(net_revenue) as net from {{ ref('mart_shop_weekly') }})
select l.net as lines_net, d.net as daily_net, w.net as weekly_net, l.orders, d.orders as daily_orders
from l cross join d cross join w
where l.net <> d.net or l.net <> w.net or l.orders <> d.orders
