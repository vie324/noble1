-- ============================================================
-- 025_store_targets.sql : 店舗別の月次目標（売上・新規件数）と実績ビュー
--   ・store_monthly_targets : 店舗 × 月 の目標（経営 > 目標設定 で入力）
--   ・store_monthly_actuals : 店舗 × 月 の実績（ビュー。目標との比較に使う）
--       売上   … 実績入力（daily_sales）の月合計（入金ベース／会計上の両方）
--       新規数 … 初回来店日（customers.first_visit_on）がその月の顧客数
--     サロンワン連携で実績を取り込むようになったら、このビューの中身だけを
--     差し替えて取得元を切り替える（画面側は変更不要）。
--   目標・実績は経営情報のため管理者専用（スタッフには非公開）
--
-- ※ 何度実行しても安全です（既にテーブルがある場合はスキップし、
--    トリガー・ポリシー・ビューだけを正しい状態に貼り直します）。
--    最後に確認結果が表で表示されます。
--
-- ロールバック手順:
--   drop view if exists public.store_monthly_actuals;
--   drop table if exists public.store_monthly_targets cascade;
-- ============================================================

-- ----------------------------------------------------------------
-- 店舗別 月次目標（店舗 × 月で1行。month は月初日で保持）
-- ----------------------------------------------------------------
create table if not exists public.store_monthly_targets (
  id                    bigint generated always as identity primary key,
  store_id              bigint not null references public.stores (id) on delete cascade,
  month                 date not null check (extract(day from month) = 1),  -- 例: 2026-09-01
  target_sales          int not null default 0 check (target_sales >= 0),          -- 売上目標（円）
  target_new_customers  int not null default 0 check (target_new_customers >= 0),  -- 新規件数目標
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid default auth.uid(),
  updated_by            uuid default auth.uid(),
  unique (store_id, month)
);

drop trigger if exists trg_store_monthly_targets_audit on public.store_monthly_targets;
create trigger trg_store_monthly_targets_audit before update on public.store_monthly_targets
  for each row execute function public.set_audit_fields();

alter table public.store_monthly_targets enable row level security;
drop policy if exists store_monthly_targets_admin on public.store_monthly_targets;
create policy store_monthly_targets_admin on public.store_monthly_targets for all
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------
-- 店舗別 月次実績（ビュー）
--   cash_in          = 都度払い + 回数券販売 + 物販（入金ベース）
--   accounting_sales = 都度払い + 回数券消化 + 物販（会計上売上）
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
)
select
  coalesce(s.store_id, n.store_id)  as store_id,
  coalesce(s.month, n.month)        as month,
  coalesce(s.cash_in, 0)            as cash_in,
  coalesce(s.accounting_sales, 0)   as accounting_sales,
  coalesce(n.new_customers, 0)      as new_customers
from sales s
full join new_customers n on n.store_id = s.store_id and n.month = s.month;

-- ----------------------------------------------------------------
-- 適用結果の確認（この表が2行とも「OK」なら設定完了です）
-- ----------------------------------------------------------------
select
  c.relname                                                     as "テーブル/ビュー",
  case c.relkind when 'v' then 'ビュー' else 'テーブル' end       as "種類",
  case
    when c.relkind = 'v' then
      case when c.reloptions @> array['security_invoker=true'] then 'OK' else '要確認' end
    when c.relrowsecurity then 'OK'
    else '未設定'
  end                                                           as "RLS",
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname)   as "ポリシー数"
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('store_monthly_targets', 'store_monthly_actuals')
order by c.relkind, c.relname;
