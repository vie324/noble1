-- ============================================================
-- 010_sales_seed.sql : 売上・分析の動作確認用シードデータ
--   直近2ヶ月分の日次売上（3店舗）・媒体実績・スタッフ実績
--
-- ロールバック手順:
--   truncate table public.staff_monthly, public.media_monthly,
--     public.media_sources, public.daily_sales restart identity cascade;
-- ============================================================

-- 媒体マスタ
insert into public.media_sources (name, sort_order) values
  ('ホットペッパー', 1),
  ('Instagram', 2),
  ('紹介', 3),
  ('Google検索', 4);

-- 日次売上: 今月と先月、3店舗 × 主要日（確認に十分な粒度）
insert into public.daily_sales (date, store_id, spot_sales, ticket_sales, ticket_usage, product_sales)
select
  d::date,
  s.id,
  -- 店舗ごとに桁感を変えたダミー値（日によって揺らぎ）
  60000 + (extract(day from d)::int * 1500 % 45000) + s.id * 8000,
  case when extract(day from d)::int % 5 = 0 then 85000 else 0 end,
  17000 * (1 + extract(day from d)::int % 3),
  case when extract(day from d)::int % 4 = 0 then 12000 else 4000 end
from generate_series(
       date_trunc('month', (now() at time zone 'Asia/Tokyo')::date - interval '1 month'),
       (now() at time zone 'Asia/Tokyo')::date,
       interval '1 day'
     ) d
cross join public.stores s
where extract(dow from d) <> 1;  -- 月曜定休の想定

-- 媒体別 月次実績（先月・今月 / 全店舗合算 store_id = null）
insert into public.media_monthly (month, media_source_id, store_id, new_visits, repeat_rate, sales, ad_cost)
select m::date, ms.id, null,
  case ms.name
    when 'ホットペッパー' then 45 when 'Instagram' then 28
    when '紹介' then 15 else 9 end,
  case ms.name
    when 'ホットペッパー' then 35.0 when 'Instagram' then 52.0
    when '紹介' then 78.0 else 41.0 end,
  case ms.name
    when 'ホットペッパー' then 680000 when 'Instagram' then 420000
    when '紹介' then 320000 else 150000 end,
  case ms.name
    when 'ホットペッパー' then 382500 when 'Instagram' then 89600
    when '紹介' then 0 else 45000 end
from generate_series(
       date_trunc('month', (now() at time zone 'Asia/Tokyo')::date - interval '1 month'),
       date_trunc('month', (now() at time zone 'Asia/Tokyo')::date),
       interval '1 month'
     ) m
cross join public.media_sources ms;

-- スタッフ月次実績（今月）
insert into public.staff_monthly (staff_id, month, sales, target_sales, nomination, retention_rate, review_score)
select
  st.id,
  date_trunc('month', (now() at time zone 'Asia/Tokyo')::date)::date,
  400000 + st.id * 110000,
  600000 + st.id * 100000,
  10 + st.id * 4,
  60.0 + st.id * 4,
  4.2 + (st.id % 3) * 0.2
from public.staff st;
