"""One-off profiling of the raw retail file, used to design the cleaning rules. Prints markdown."""
import duckdb

con = duckdb.connect()
con.execute("create view raw as select * from 'data/raw/retail/online_retail_ii.parquet'")


def show(title, sql):
    print(f"\n### {title}\n")
    try:
        print(con.sql(sql).df().to_markdown(index=False))
    except Exception as exc:  # keep profiling the rest
        print(f"ERROR: {exc}")


show("Rows and date range per sheet", """
    select source_sheet, count(*) rows, min(invoice_date) first, max(invoice_date) last
    from raw group by 1 order by 1""")

show("Column types", "describe raw")

show("Overlap window: rows per sheet by day where both sheets have data", """
    with b as (select min(invoice_date)::date d from raw where source_sheet = 'Year 2010-2011')
    select invoice_date::date as d, source_sheet, count(*) rows, round(sum(quantity*price),2) amount
    from raw, b where invoice_date::date >= b.d and invoice_date::date <= (select max(invoice_date)::date from raw where source_sheet='Year 2009-2010')
    group by all order by 1, 2""")

show("Overlap identity check (multiset difference both ways)", """
    with a as (select invoice, stock_code, description, quantity, invoice_date, price, customer_id, country
               from raw where source_sheet='Year 2009-2010' and invoice_date >= '2010-12-01'),
         b as (select invoice, stock_code, description, quantity, invoice_date, price, customer_id, country
               from raw where source_sheet='Year 2010-2011' and invoice_date < '2010-12-10')
    select (select count(*) from (select * from a except all select * from b)) a_not_in_b,
           (select count(*) from (select * from b except all select * from a)) b_not_in_a,
           (select count(*) from a) a_rows, (select count(*) from b) b_rows""")

show("Invoice prefixes", """
    select regexp_extract(invoice, '^[A-Za-z]*') prefix, count(*) rows, count(distinct invoice) invoices,
           round(sum(quantity*price),2) amount, min(quantity) min_q, max(quantity) max_q
    from raw group by 1 order by 2 desc""")

show("Stock codes that are NOT 5 digits + optional letters", """
    select stock_code, any_value(description) sample_desc, count(*) rows, round(sum(quantity*price),2) amount,
           min(price) min_price, max(price) max_price
    from raw where not regexp_full_match(stock_code, '[0-9]{5}[A-Za-z]{0,2}')
    group by 1 order by rows desc limit 80""")

show("Lowercase-letter product codes (5 digits + letters) count", """
    select count(*) rows, count(distinct stock_code) codes from raw
    where regexp_full_match(stock_code, '[0-9]{5}[a-z]{1,2}')""")

show("Price decimals distribution", """
    select case when price = round(price,2) then 'le2dp' when price = round(price,3) then 'dp3' else 'gt3dp' end as k,
           count(*) rows, min(price), max(price)
    from raw group by 1""")

show("Price <= 0 and negative quantity breakdown", """
    select (price<=0) price_le_0, (quantity<0) neg_qty, starts_with(invoice,'C') is_c, count(*) rows,
           round(sum(quantity*price),2) amount
    from raw group by all order by all""")

show("Exact duplicate rows within the same sheet", """
    select source_sheet, sum(n-1) extra_copies, count(*) dup_groups, round(sum((n-1)*amt),2) extra_amount from (
      select source_sheet, invoice, stock_code, description, quantity, invoice_date, price, customer_id, country,
             count(*) n, any_value(quantity*price) amt
      from raw group by all having count(*) > 1) group by 1""")

show("Customer id nulls and countries", """
    select count(*) filter (where customer_id is null) null_customer_rows, count(*) rows,
           count(distinct customer_id) customers, count(distinct country) countries from raw""")

show("Countries", "select country, count(*) rows from raw group by 1 order by 2 desc")

show("Descriptions per stock code (top multi-description codes)", """
    select stock_code, count(distinct description) n_desc from raw group by 1 having n_desc>2 order by 2 desc limit 10""")

show("Weekday distribution", "select dayname(invoice_date) d, count(*) from raw group by 1 order by 2 desc")

show("Monthly net amount (all lines)", """
    select date_trunc('month', invoice_date) m, count(*) rows, round(sum(quantity*price),2) amount
    from raw group by 1 order by 1""")
