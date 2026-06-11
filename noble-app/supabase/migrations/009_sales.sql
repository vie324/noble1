-- ============================================================
-- 009_sales.sql : 経営ダッシュボード移植用の売上・分析データ
--   日次売上 / 媒体マスタ / 媒体別月次実績 / スタッフ月次実績
--
-- 売上・分析データはすべて管理者専用（スタッフには RLS で遮断）。
-- スタッフ別実績（売上・指名・リピート率）は指示書 §4 により
-- スタッフ本人にも見せないため select も管理者のみ。
--
-- ロールバック手順:
--   drop table if exists public.staff_monthly cascade;
--   drop table if exists public.media_monthly cascade;
--   drop table if exists public.media_sources cascade;
--   drop table if exists public.daily_sales cascade;
-- ============================================================

-- ----------------------------------------------------------------
-- 日次売上（既存ダッシュボードの「実績入力」を踏襲。店舗×日付で1行）
--   会計上売上 = 都度払い + 回数券消化 + 物販
--   キャッシュイン = 都度払い + 回数券販売 + 物販
--   （導出値は保存せずアプリ側で計算）
-- ----------------------------------------------------------------
create table public.daily_sales (
  id            bigint generated always as identity primary key,
  date          date not null,
  store_id      bigint not null references public.stores (id),
  spot_sales    int not null default 0 check (spot_sales >= 0),    -- 都度払い
  ticket_sales  int not null default 0 check (ticket_sales >= 0),  -- 回数券販売（現金イン）
  ticket_usage  int not null default 0 check (ticket_usage >= 0),  -- 回数券消化（役務）
  product_sales int not null default 0 check (product_sales >= 0), -- 物販
  memo          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  updated_by    uuid default auth.uid(),
  unique (date, store_id)
);

create trigger trg_daily_sales_audit before update on public.daily_sales
  for each row execute function public.set_audit_fields();

create index idx_daily_sales_date on public.daily_sales (date, store_id);

-- ----------------------------------------------------------------
-- 集客媒体マスタ（ホットペッパー / Instagram / 紹介 など）
-- ----------------------------------------------------------------
create table public.media_sources (
  id          bigint generated always as identity primary key,
  name        text not null,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_by  uuid default auth.uid()
);

create trigger trg_media_sources_audit before update on public.media_sources
  for each row execute function public.set_audit_fields();

-- ----------------------------------------------------------------
-- 媒体別 月次実績（month は月初日で保持。CPA = 広告費 ÷ 新規 はアプリ側計算）
-- ----------------------------------------------------------------
create table public.media_monthly (
  id               bigint generated always as identity primary key,
  month            date not null,                -- 例: 2026-06-01
  media_source_id  bigint not null references public.media_sources (id),
  store_id         bigint references public.stores (id),  -- null = 全店舗
  new_visits       int not null default 0 check (new_visits >= 0),
  repeat_rate      numeric(5,1) not null default 0 check (repeat_rate between 0 and 100),
  sales            int not null default 0 check (sales >= 0),
  ad_cost          int not null default 0 check (ad_cost >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid default auth.uid(),
  updated_by       uuid default auth.uid(),
  unique (month, media_source_id, store_id)
);

create trigger trg_media_monthly_audit before update on public.media_monthly
  for each row execute function public.set_audit_fields();

-- ----------------------------------------------------------------
-- スタッフ月次実績（売上・目標・指名・リピート率 — 管理者専用）
-- ----------------------------------------------------------------
create table public.staff_monthly (
  id            bigint generated always as identity primary key,
  staff_id      bigint not null references public.staff (id) on delete cascade,
  month         date not null,                  -- 月初日
  sales         int not null default 0 check (sales >= 0),
  target_sales  int not null default 0 check (target_sales >= 0),
  nomination    int not null default 0 check (nomination >= 0),   -- 指名数
  retention_rate numeric(5,1) not null default 0 check (retention_rate between 0 and 100),
  review_score  numeric(2,1),                   -- 満足度（任意）
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  updated_by    uuid default auth.uid(),
  unique (staff_id, month)
);

create trigger trg_staff_monthly_audit before update on public.staff_monthly
  for each row execute function public.set_audit_fields();

-- ----------------------------------------------------------------
-- RLS: 売上・分析データは管理者のみ（select も含む）
-- ----------------------------------------------------------------
alter table public.daily_sales enable row level security;
create policy daily_sales_admin on public.daily_sales for all
  using (public.is_admin()) with check (public.is_admin());

alter table public.media_sources enable row level security;
create policy media_sources_admin on public.media_sources for all
  using (public.is_admin()) with check (public.is_admin());

alter table public.media_monthly enable row level security;
create policy media_monthly_admin on public.media_monthly for all
  using (public.is_admin()) with check (public.is_admin());

alter table public.staff_monthly enable row level security;
create policy staff_monthly_admin on public.staff_monthly for all
  using (public.is_admin()) with check (public.is_admin());
