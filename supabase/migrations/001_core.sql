-- ============================================================
-- 001_core.sql : 基盤（店舗・スタッフ・共通関数）
--
-- ロールバック手順:
--   drop table if exists public.staff cascade;
--   drop table if exists public.stores cascade;
--   drop function if exists public.current_staff_id();
--   drop function if exists public.is_admin();
--   drop function if exists public.is_active_staff();
--   drop function if exists public.set_audit_fields();
-- ============================================================

-- 監査カラム（updated_at / updated_by）を自動更新する共通トリガー関数
create or replace function public.set_audit_fields()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- ----------------------------------------------------------------
-- 店舗マスタ
-- ----------------------------------------------------------------
create table public.stores (
  id          bigint generated always as identity primary key,
  name        text not null,
  code        text not null unique,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_by  uuid default auth.uid()
);

create trigger trg_stores_audit before update on public.stores
  for each row execute function public.set_audit_fields();

-- ----------------------------------------------------------------
-- スタッフ（auth.users と 1:1。email は auth ユーザー紐付け用）
-- ----------------------------------------------------------------
create table public.staff (
  id            bigint generated always as identity primary key,
  auth_user_id  uuid unique references auth.users (id) on delete set null,
  email         text not null unique,
  name          text not null,
  kana          text,
  role          text not null default 'staff' check (role in ('admin', 'staff')),
  store_id      bigint references public.stores (id),  -- 主所属（閲覧は全店舗可）
  icon_emoji    text not null default '🐰',             -- フェーズ2カレンダーで使用
  theme_color   text not null default '#B89B5E',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  updated_by    uuid default auth.uid()
);

create trigger trg_staff_audit before update on public.staff
  for each row execute function public.set_audit_fields();

-- ----------------------------------------------------------------
-- 共通ヘルパー関数（RLSポリシーから利用）
-- ----------------------------------------------------------------

-- ログイン中ユーザーの staff.id
create or replace function public.current_staff_id()
returns bigint
language sql stable security definer set search_path = public
as $$
  select id from public.staff
  where auth_user_id = auth.uid() and is_active
  limit 1;
$$;

-- ログイン中ユーザーが有効なスタッフか
create or replace function public.is_active_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.staff
    where auth_user_id = auth.uid() and is_active
  );
$$;

-- ログイン中ユーザーが管理者か
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.staff
    where auth_user_id = auth.uid() and is_active and role = 'admin'
  );
$$;
