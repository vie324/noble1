-- ============================================================
-- targets-2026-09_2027-08.sql : 店舗別 月次目標（2026年9月〜2027年8月）
--   新宿本店   … 年間売上 2,000万円 / 年間新規 286件
--   新宿南口店 … 年間売上 2,100万円 / 年間新規 300件
--
-- 使い方: migrations/025_store_targets.sql を実行した後、Supabase の
--         SQL Editor でこのファイル全体を実行する。
--         何度実行しても安全です（同じ店舗・同じ月の目標は上書きされます）。
--         最後に月別の目標と年間合計が表で表示されます。
--
--   ・新宿本店は店舗コード shinjuku（アプリ上の表示名「新宿店」）、
--     新宿南口店は shinjuku-south に登録します
--   ・売上は万円で書いています（135 = 1,350,000円）
--   ・別の年度に入れる場合は start_month（年度の開始月 = 9月の月初日）だけを変更
--   ・登録後は アプリの「経営 > 目標設定」からも確認・修正できます
-- ============================================================

do $$
begin
  if to_regclass('public.store_monthly_targets') is null then
    raise exception '目標テーブルがありません。先に supabase/migrations/025_store_targets.sql を実行してください';
  end if;
  if (select count(*) from public.stores where code in ('shinjuku', 'shinjuku-south')) < 2 then
    raise exception '店舗コード shinjuku / shinjuku-south の店舗が見つかりません（stores テーブルの code を確認してください）';
  end if;
end $$;

with fiscal_year as (
  select date '2026-09-01' as start_month  -- ←年度の開始月（9月）
),
targets (store_code, month_no, sales_man_yen, new_customers) as (
  values
    -- 新宿本店（新宿店）
    ('shinjuku',        9, 135, 19),
    ('shinjuku',       10, 135, 19),
    ('shinjuku',       11, 135, 19),
    ('shinjuku',       12, 200, 29),
    ('shinjuku',        1, 135, 19),
    ('shinjuku',        2, 160, 23),
    ('shinjuku',        3, 195, 28),
    ('shinjuku',        4, 195, 28),
    ('shinjuku',        5, 195, 28),
    ('shinjuku',        6, 195, 28),
    ('shinjuku',        7, 200, 29),
    ('shinjuku',        8, 120, 17),
    -- 新宿南口店
    ('shinjuku-south',  9, 145, 21),
    ('shinjuku-south', 10, 165, 24),
    ('shinjuku-south', 11, 170, 24),
    ('shinjuku-south', 12, 190, 27),
    ('shinjuku-south',  1, 145, 21),
    ('shinjuku-south',  2, 150, 21),
    ('shinjuku-south',  3, 160, 23),
    ('shinjuku-south',  4, 170, 24),
    ('shinjuku-south',  5, 210, 30),
    ('shinjuku-south',  6, 225, 32),
    ('shinjuku-south',  7, 210, 30),
    ('shinjuku-south',  8, 160, 23)
),
saved as (
  insert into public.store_monthly_targets (store_id, month, target_sales, target_new_customers)
  select
    s.id,
    -- 9月→開始年、1〜8月→翌年 の月初日
    (fy.start_month
      + make_interval(months => (t.month_no - extract(month from fy.start_month)::int + 12) % 12)
    )::date,
    t.sales_man_yen * 10000,
    t.new_customers
  from targets t
  join public.stores s on s.code = t.store_code
  cross join fiscal_year fy
  on conflict (store_id, month) do update set
    target_sales         = excluded.target_sales,
    target_new_customers = excluded.target_new_customers
  returning store_id, month, target_sales, target_new_customers
)
-- 確認: 月別の目標と年間合計（年間合計が 2,000万円/286件・2,100万円/300件 なら完了）
select
  coalesce(to_char(v.month, 'YYYY年FMMM月'), '年間合計') as "月",
  rtrim(to_char(sum(v.target_sales) filter (where st.code = 'shinjuku') / 10000.0,
                'FM999,999.99'), '.') || '万円'                          as "新宿店 売上目標",
  sum(v.target_new_customers) filter (where st.code = 'shinjuku') || '件' as "新宿店 新規目標",
  rtrim(to_char(sum(v.target_sales) filter (where st.code = 'shinjuku-south') / 10000.0,
                'FM999,999.99'), '.') || '万円'                          as "新宿南口店 売上目標",
  sum(v.target_new_customers) filter (where st.code = 'shinjuku-south') || '件' as "新宿南口店 新規目標"
from saved v
join public.stores st on st.id = v.store_id
group by rollup (v.month)
order by v.month nulls last;
