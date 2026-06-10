-- ============================================================
-- 003_customers.sql : 顧客・顧客フラグ・申し送りメモ
--
-- ロールバック手順:
--   drop table if exists public.customer_notes cascade;
--   drop table if exists public.customer_flags cascade;
--   drop table if exists public.customers cascade;
-- ============================================================

create table public.customers (
  id                bigint generated always as identity primary key,
  name              text not null,
  kana              text not null default '',
  phone             text not null default '',
  email             text,
  primary_store_id  bigint references public.stores (id),
  line_chat_url     text,            -- LINEトークへの外部リンク（ワンタップ導線）
  booking_memo      text,            -- サロンボードの予約メモ相当（手入力）
  first_visit_on    date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid(),
  updated_by        uuid default auth.uid()
);

create trigger trg_customers_audit before update on public.customers
  for each row execute function public.set_audit_fields();

-- 部分一致検索用（名前／カナ／電話）
create index idx_customers_name  on public.customers (name);
create index idx_customers_kana  on public.customers (kana);
create index idx_customers_phone on public.customers (phone);

-- ----------------------------------------------------------------
-- 顧客フラグ（クレーム対応中／要注意 など。解除は行削除ではなく resolved_at）
-- ----------------------------------------------------------------
create table public.customer_flags (
  id            bigint generated always as identity primary key,
  customer_id   bigint not null references public.customers (id) on delete cascade,
  flag_type_id  bigint not null references public.flag_types (id),
  note          text,
  resolved_at   timestamptz,         -- null = 有効なフラグ
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  updated_by    uuid default auth.uid()
);

create trigger trg_customer_flags_audit before update on public.customer_flags
  for each row execute function public.set_audit_fields();

create index idx_customer_flags_customer on public.customer_flags (customer_id)
  where resolved_at is null;

-- ----------------------------------------------------------------
-- 申し送りメモ（ピン留めで顧客ページ・今日ボードに常時表示）
-- ----------------------------------------------------------------
create table public.customer_notes (
  id           bigint generated always as identity primary key,
  customer_id  bigint not null references public.customers (id) on delete cascade,
  body         text not null,
  pinned       boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid default auth.uid(),
  updated_by   uuid default auth.uid()
);

create trigger trg_customer_notes_audit before update on public.customer_notes
  for each row execute function public.set_audit_fields();

create index idx_customer_notes_customer on public.customer_notes (customer_id);
