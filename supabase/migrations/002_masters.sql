-- ============================================================
-- 002_masters.sql : マスタ（メニュー・施術部位・フラグ種別・回数券商品）
--
-- ロールバック手順:
--   drop table if exists public.ticket_products cascade;
--   drop table if exists public.flag_types cascade;
--   drop table if exists public.body_parts cascade;
--   drop table if exists public.menus cascade;
-- ============================================================

-- 施術メニュー
create table public.menus (
  id          bigint generated always as identity primary key,
  name        text not null,
  price       int not null default 0,
  -- 対応店舗。空配列 = 全店舗対応
  store_ids   bigint[] not null default '{}',
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_by  uuid default auth.uid()
);

create trigger trg_menus_audit before update on public.menus
  for each row execute function public.set_audit_fields();

-- 施術部位（顔／背中上部／背中全体／腕／脚 など）
create table public.body_parts (
  id          bigint generated always as identity primary key,
  name        text not null,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_by  uuid default auth.uid()
);

create trigger trg_body_parts_audit before update on public.body_parts
  for each row execute function public.set_audit_fields();

-- 顧客フラグ種別（クレーム対応中／要注意／変更連絡あり／VIP など）
create table public.flag_types (
  id          bigint generated always as identity primary key,
  name        text not null,
  -- デザイントークンに対応する色キー
  color_key   text not null default 'warn'
              check (color_key in ('caution', 'warn', 'ok', 'rose', 'gold')),
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_by  uuid default auth.uid()
);

create trigger trg_flag_types_audit before update on public.flag_types
  for each row execute function public.set_audit_fields();

-- 回数券商品マスタ
create table public.ticket_products (
  id           bigint generated always as identity primary key,
  name         text not null,
  total_count  int not null check (total_count > 0),
  price        int not null check (price >= 0),
  valid_days   int not null default 180 check (valid_days > 0),
  sort_order   int not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid default auth.uid(),
  updated_by   uuid default auth.uid()
);

create trigger trg_ticket_products_audit before update on public.ticket_products
  for each row execute function public.set_audit_fields();
