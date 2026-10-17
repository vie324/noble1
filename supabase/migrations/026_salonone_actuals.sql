-- ============================================================
-- 026_salonone_actuals.sql : サロンワン（分析API）の売上・新規数を実績に使う
--   ・stores.salonone_shop_id : サロンワンの店舗ID（対応づけ）
--   ・stores.salonone_from    : サロンワン切替月。この月以降の実績はサロンワンの値を使う
--                                （未設定 = これまでどおり Noble の実績入力・カルテ）
--   ・salonone_monthly_sales  : サロンワンから取り込んだ 店舗 × 月 の数値
--                                （/sales/summary?group_by=shop の結果。毎朝自動＋手動で取り込み）
--   ・store_monthly_actuals   : 025 の実績ビューを、切替月以降はサロンワンの値に差し替える
--       売上 入金ベース … gross_sales（粗売上：購入時点で計上）
--            会計上     … consumed_sales（消化売上：施術提供時点で計上）
--       新規数         … new_visit_count（新規の来店数。会計済みの来店のみ）
--
-- 前提: 025_store_targets.sql を実行済みであること
--
-- ※ 何度実行しても安全です（既にある列・テーブルはスキップし、
--    ポリシー・ビューだけを正しい状態に貼り直します）。
--    最後に確認結果が表で表示されます。
--
-- ロールバック手順（025 のビュー定義に戻す場合は 025 を再実行）:
--   drop view if exists public.store_monthly_actuals;
--   drop table if exists public.salonone_monthly_sales;
--   alter table public.stores drop column if exists salonone_from;
--   alter table public.stores drop column if exists salonone_shop_id;
--   その後 025_store_targets.sql を再実行
-- ============================================================

-- ----------------------------------------------------------------
-- 店舗 ↔ サロンワン店舗の対応づけと切替月（経営 > 目標設定 で変更できる）
-- ----------------------------------------------------------------
alter table public.stores
  add column if not exists salonone_shop_id bigint unique;
alter table public.stores
  add column if not exists salonone_from date check (extract(day from salonone_from) = 1);

-- 対応づけの初期値（未設定の店舗だけ。サロンワンの GET /shops で確認した ID）
update public.stores set salonone_shop_id = 36619 where code = 'shinjuku'       and salonone_shop_id is null;
update public.stores set salonone_shop_id = 36564 where code = 'shinjuku-south' and salonone_shop_id is null;
update public.stores set salonone_shop_id = 67061 where code = 'ebisu'          and salonone_shop_id is null;

-- ----------------------------------------------------------------
-- サロンワンから取り込んだ月次の数値（サロンワン店舗 × 月で1行）
--   書き込みはサーバー（service role）の取り込み処理だけ。画面からは読み取りのみ
--   金額は円（サロンワンの amounts_jpy）
-- ----------------------------------------------------------------
create table if not exists public.salonone_monthly_sales (
  shop_id             bigint not null,                                    -- サロンワンの店舗ID
  month               date not null check (extract(day from month) = 1),  -- 例: 2026-10-01
  shop_name           text,
  gross_sales         bigint not null default 0,  -- 粗売上（購入時点で計上）
  consumed_sales      bigint not null default 0,  -- 消化売上（施術提供時点で計上。失効益を含む）
  digest_sales        bigint not null default 0,  -- 会計済み売上
  digest_count        int    not null default 0,  -- 会計済みの件数（サロンワンで会計しているかの目安）
  refund_amount       bigint not null default 0,  -- 返金高（売上に対する返金のみ）
  new_visit_count     int    not null default 0,  -- 新規の来店数
  repeat_visit_count  int    not null default 0,  -- 再来の来店数
  fetched_at          timestamptz not null default now(),
  primary key (shop_id, month)
);

alter table public.salonone_monthly_sales enable row level security;
drop policy if exists salonone_monthly_sales_admin_read on public.salonone_monthly_sales;
create policy salonone_monthly_sales_admin_read on public.salonone_monthly_sales for select
  using (public.is_admin());

-- ----------------------------------------------------------------
-- 店舗別 月次実績（ビュー。025 の定義に source / fetched_at を追加）
--   切替月以降（stores.salonone_from <= month）… サロンワンの値
--   それより前・切替月が未設定                … Noble の実績入力・カルテ（025 と同じ）
--   security_invoker = 呼び出し元の RLS を適用（売上は管理者のみ見える）
-- ----------------------------------------------------------------
create or replace view public.store_monthly_actuals
with (security_invoker = true)
as
with sales as (
  select
    store_id,
    date_trunc('month', date)::date                       as month,
    sum(spot_sales + ticket_sales + product_sales)::bigint as cash_in,
    sum(spot_sales + ticket_usage + product_sales)::bigint as accounting_sales
  from public.daily_sales
  group by 1, 2
),
new_customers as (
  select
    primary_store_id                         as store_id,
    date_trunc('month', first_visit_on)::date as month,
    count(*)::int                            as new_customers
  from public.customers
  where first_visit_on is not null
    and primary_store_id is not null
  group by 1, 2
),
noble as (
  select
    coalesce(s.store_id, n.store_id)  as store_id,
    coalesce(s.month, n.month)        as month,
    coalesce(s.cash_in, 0)            as cash_in,
    coalesce(s.accounting_sales, 0)   as accounting_sales,
    coalesce(n.new_customers, 0)      as new_customers
  from sales s
  full join new_customers n on n.store_id = s.store_id and n.month = s.month
)
select
  n.store_id,
  n.month,
  n.cash_in,
  n.accounting_sales,
  n.new_customers,
  'noble'::text           as source,
  null::timestamptz       as fetched_at
from noble n
where not exists (
  select 1 from public.stores st
  where st.id = n.store_id
    and st.salonone_shop_id is not null
    and st.salonone_from is not null
    and n.month >= st.salonone_from
)
union all
select
  st.id                   as store_id,
  so.month,
  so.gross_sales          as cash_in,
  so.consumed_sales       as accounting_sales,
  so.new_visit_count      as new_customers,
  'salonone'::text        as source,
  so.fetched_at
from public.salonone_monthly_sales so
join public.stores st on st.salonone_shop_id = so.shop_id
where st.salonone_from is not null
  and so.month >= st.salonone_from;

-- ----------------------------------------------------------------
-- 適用結果の確認（店舗ごとの対応づけ・切替月と、RLS の状態）
--   切替月が空欄の店舗は、これまでどおり Noble の実績を使います
-- ----------------------------------------------------------------
select
  s.name                                                        as "店舗",
  s.code                                                        as "店舗コード",
  s.salonone_shop_id                                            as "サロンワン店舗ID",
  coalesce(to_char(s.salonone_from, 'YYYY年FMMM月〜'), '未設定（Noble の実績）') as "サロンワン切替月",
  (select case when c.relrowsecurity then 'OK' else '未設定' end
     from pg_class c
    where c.oid = 'public.salonone_monthly_sales'::regclass)    as "取込テーブルの RLS",
  (select case when c.reloptions @> array['security_invoker=true'] then 'OK' else '要確認' end
     from pg_class c
    where c.oid = 'public.store_monthly_actuals'::regclass)     as "実績ビュー"
from public.stores s
order by s.sort_order, s.id;
