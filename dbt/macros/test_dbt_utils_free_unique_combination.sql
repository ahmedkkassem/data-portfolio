{% test dbt_utils_free_unique_combination(model, columns) %}
-- Fails when a combination of columns appears more than once (dbt_utils-style, without the package).
select {{ columns | join(', ') }}, count(*) as n
from {{ model }}
group by {{ columns | join(', ') }}
having count(*) > 1
{% endtest %}
