-- Data issues found in the source, reported rather than hidden.
select
    count(*) as requests_in_window,
    count(*) filter (where has_impossible_close_date) as impossible_close_dates,
    count(*) filter (where borough = 'Unspecified') as unspecified_borough,
    count(*) filter (where is_closed and closed_at is null) as closed_without_close_date,
    min(created_at) as window_start,
    max(created_at) as data_current_to,
    max(source_updated_at) as last_source_update
from {{ ref('stg_nyc311__requests') }}
