-- One row per service request, cleaned. Close times that are impossible (before the request was opened)
-- are kept as data issues and excluded from timing metrics, never silently "fixed".
select
    unique_key,
    created_date as created_at,
    cast(created_date as date) as created_day,
    closed_date as closed_at,
    upper(trim(agency)) as agency,
    trim(complaint_type) as complaint_type,
    case
        when upper(borough) in ('BRONX', 'BROOKLYN', 'MANHATTAN', 'QUEENS') then initcap(lower(borough))
        when upper(borough) = 'STATEN ISLAND' then 'Staten Island'
        else 'Unspecified'
    end as borough,
    coalesce(status, 'Unspecified') as status,
    status = 'Closed' as is_closed,
    closed_date is not null and closed_date < created_date as has_impossible_close_date,
    case
        when closed_date is not null and closed_date >= created_date
            then date_diff('minute', created_date, closed_date) / 60.0
    end as hours_to_close,
    source_updated_at
from {{ source('nyc311', 'nyc311_requests') }}
