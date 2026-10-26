{#- Small helpers so the shop models run unchanged on DuckDB (CI, no accounts) and BigQuery (the demo). -#}

{% macro shop_raw() -%}
  {%- if target.type == 'bigquery' -%} {{ source('shop_raw', 'order_lines') }}
  {%- else -%} read_parquet('data/shop/order_lines.parquet')
  {%- endif -%}
{%- endmacro %}

{% macro money(x) -%}
  {%- if target.type == 'bigquery' -%} cast(round({{ x }}, 3) as numeric)
  {%- else -%} cast(round({{ x }}, 3) as decimal(18, 3))
  {%- endif -%}
{%- endmacro %}

{% macro week_start(d) -%}
  {%- if target.type == 'bigquery' -%} date_trunc({{ d }}, isoweek)
  {%- else -%} cast(date_trunc('week', {{ d }}) as date)
  {%- endif -%}
{%- endmacro %}

{% macro month_start(d) -%}
  {%- if target.type == 'bigquery' -%} date_trunc({{ d }}, month)
  {%- else -%} cast(date_trunc('month', {{ d }}) as date)
  {%- endif -%}
{%- endmacro %}

{% macro add_days(d, n) -%}
  {%- if target.type == 'bigquery' -%} date_add({{ d }}, interval {{ n }} day)
  {%- else -%} cast({{ d }} + ({{ n }}) * interval 1 day as date)
  {%- endif -%}
{%- endmacro %}

{% macro days_between(a, b) -%}
  {%- if target.type == 'bigquery' -%} date_diff({{ b }}, {{ a }}, day)
  {%- else -%} datediff('day', {{ a }}, {{ b }})
  {%- endif -%}
{%- endmacro %}

{#- one row per day from a to b (inclusive), column "day" -#}
{% macro day_spine(a, b) -%}
  {%- if target.type == 'bigquery' -%} select day from unnest(generate_date_array({{ a }}, {{ b }})) as day
  {%- else -%} select cast(generate_series as date) as day from generate_series(cast({{ a }} as timestamp), cast({{ b }} as timestamp), interval 1 day)
  {%- endif -%}
{%- endmacro %}
