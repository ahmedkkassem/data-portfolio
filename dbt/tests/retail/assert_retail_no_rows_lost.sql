-- Every raw source row is classified exactly once: nothing lost, nothing duplicated by joins.
select raw_rows, classified_rows
from (select count(*) as raw_rows from {{ source('retail', 'online_retail_ii') }})
cross join (select count(*) as classified_rows from {{ ref('int_retail__lines_classified') }})
where raw_rows <> classified_rows
