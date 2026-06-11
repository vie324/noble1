-- ============================================================
-- 013_phase3.sql : フェーズ3
--   ① カウンセリングシート・同意書の電子化
--   ② スタッフ掲示板・資料置き場
--   ③ 在庫管理
--
-- ロールバック手順:
--   drop table if exists public.stock_counts cascade;
--   drop table if exists public.menu_consumptions cascade;
--   drop table if exists public.stock_entries cascade;
--   drop table if exists public.products cascade;
--   drop table if exists public.board_attachments cascade;
--   drop table if exists public.board_posts cascade;
--   drop table if exists public.consent_documents cascade;
--   drop table if exists public.consent_templates cascade;
--   drop table if exists public.counseling_sheets cascade;
--   drop table if exists public.counseling_questions cascade;
--   delete from storage.objects where bucket_id in ('documents','board-files','inventory-docs');
--   delete from storage.buckets where id in ('documents','board-files','inventory-docs');
--   （storage ポリシーは drop policy で個別に削除）
-- ============================================================

-- ================================================================
-- ① カウンセリング・同意書
--    お客様向け公開フォーム（/f/...）は匿名アクセスのため、
--    アプリのサーバー側（service role）経由でのみ読み書きする。
--    anon ロール向けの RLS は一切開けない（トークン列挙を防止）。
-- ================================================================

-- カウンセリング項目マスタ（管理者がマスタ管理から編集）
create table public.counseling_questions (
  id          bigint generated always as identity primary key,
  label       text not null,
  field_type  text not null default 'text'
              check (field_type in ('text', 'textarea', 'choice', 'multi', 'yes_no')),
  options     text,                       -- choice/multi の選択肢（カンマ区切り）
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_by  uuid default auth.uid()
);

create trigger trg_counseling_questions_audit before update on public.counseling_questions
  for each row execute function public.set_audit_fields();

-- カウンセリングシート（顧客ごとに発行。token 付きURLをLINEで送る）
create table public.counseling_sheets (
  id            bigint generated always as identity primary key,
  customer_id   bigint not null references public.customers (id) on delete cascade,
  token         uuid not null unique default gen_random_uuid(),
  status        text not null default 'pending' check (status in ('pending', 'submitted')),
  answers       jsonb,                    -- { "質問ラベル": "回答", ... }
  submitted_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  updated_by    uuid default auth.uid()
);

create trigger trg_counseling_sheets_audit before update on public.counseling_sheets
  for each row execute function public.set_audit_fields();

create index idx_counseling_sheets_customer on public.counseling_sheets (customer_id);

-- 同意書テンプレート（本文は署名時点のスナップショットを文書側に保存）
create table public.consent_templates (
  id          bigint generated always as identity primary key,
  title       text not null,
  body        text not null,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_by  uuid default auth.uid()
);

create trigger trg_consent_templates_audit before update on public.consent_templates
  for each row execute function public.set_audit_fields();

-- 同意書（iPad またはお客様のスマホで電子署名 → 印刷用ページからPDF/印刷可）
create table public.consent_documents (
  id              bigint generated always as identity primary key,
  customer_id     bigint not null references public.customers (id) on delete cascade,
  template_id     bigint references public.consent_templates (id),
  token           uuid not null unique default gen_random_uuid(),
  title           text not null,
  body_snapshot   text not null,          -- 署名時点のテンプレート本文
  status          text not null default 'pending' check (status in ('pending', 'signed')),
  signer_name     text,                   -- 署名時に入力されたお名前
  signature_path  text,                   -- storage（documents バケット）の署名画像
  signed_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid(),
  updated_by      uuid default auth.uid()
);

create trigger trg_consent_documents_audit before update on public.consent_documents
  for each row execute function public.set_audit_fields();

create index idx_consent_documents_customer on public.consent_documents (customer_id);

-- RLS: スタッフのみ（公開フォームは service role 経由なので anon ポリシーは作らない）
alter table public.counseling_questions enable row level security;
create policy counseling_questions_select on public.counseling_questions for select
  using (public.is_active_staff());
create policy counseling_questions_admin_write on public.counseling_questions for all
  using (public.is_admin()) with check (public.is_admin());

alter table public.counseling_sheets enable row level security;
create policy counseling_sheets_staff on public.counseling_sheets for all
  using (public.is_active_staff()) with check (public.is_active_staff());

alter table public.consent_templates enable row level security;
create policy consent_templates_select on public.consent_templates for select
  using (public.is_active_staff());
create policy consent_templates_admin_write on public.consent_templates for all
  using (public.is_admin()) with check (public.is_admin());

alter table public.consent_documents enable row level security;
create policy consent_documents_staff on public.consent_documents for all
  using (public.is_active_staff()) with check (public.is_active_staff());

-- ================================================================
-- ② スタッフ掲示板・資料置き場（閲覧=全スタッフ / 投稿・編集=管理者）
-- ================================================================
create table public.board_posts (
  id          bigint generated always as identity primary key,
  category    text not null check (category in
    ('スタッフ割引価格', '店舗ルール', 'FAQ', '研修資料', 'ブログ・動画のネタ', '月末・締め作業手順', 'その他')),
  title       text not null,
  body        text not null default '',
  pinned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_by  uuid default auth.uid()
);

create trigger trg_board_posts_audit before update on public.board_posts
  for each row execute function public.set_audit_fields();

create table public.board_attachments (
  id          bigint generated always as identity primary key,
  post_id     bigint not null references public.board_posts (id) on delete cascade,
  file_path   text not null,              -- storage（board-files バケット）
  file_name   text not null,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);

alter table public.board_posts enable row level security;
create policy board_posts_select on public.board_posts for select
  using (public.is_active_staff());
create policy board_posts_admin_write on public.board_posts for all
  using (public.is_admin()) with check (public.is_admin());

alter table public.board_attachments enable row level security;
create policy board_attachments_select on public.board_attachments for select
  using (public.is_active_staff());
create policy board_attachments_admin_write on public.board_attachments for all
  using (public.is_admin()) with check (public.is_admin());

-- ================================================================
-- ③ 在庫管理
--    理論在庫 = 入庫合計 − Σ(施術記録のメニュー × 標準消費量)
--    月末に実在庫を棚卸し、差分と理由を記録する
-- ================================================================

-- 商品・備品マスタ
create table public.products (
  id          bigint generated always as identity primary key,
  name        text not null,
  unit        text not null default '個',     -- 個・本・ml など
  category    text not null default '商品' check (category in ('商品', '備品')),
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_by  uuid default auth.uid()
);

create trigger trg_products_audit before update on public.products
  for each row execute function public.set_audit_fields();

-- 入庫登録（納品書の画像保存つき）
create table public.stock_entries (
  id             bigint generated always as identity primary key,
  product_id     bigint not null references public.products (id),
  store_id       bigint not null references public.stores (id),
  date           date not null default (now() at time zone 'Asia/Tokyo')::date,
  quantity       numeric(10,2) not null check (quantity > 0),
  note           text,
  invoice_path   text,                    -- storage（inventory-docs バケット）の納品書画像
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid default auth.uid(),
  updated_by     uuid default auth.uid()
);

create trigger trg_stock_entries_audit before update on public.stock_entries
  for each row execute function public.set_audit_fields();

create index idx_stock_entries_product on public.stock_entries (product_id, store_id, date);

-- メニューごとの標準消費量（施術1回あたり）
create table public.menu_consumptions (
  menu_id     bigint not null references public.menus (id) on delete cascade,
  product_id  bigint not null references public.products (id) on delete cascade,
  amount      numeric(10,2) not null check (amount >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_by  uuid default auth.uid(),
  primary key (menu_id, product_id)
);

create trigger trg_menu_consumptions_audit before update on public.menu_consumptions
  for each row execute function public.set_audit_fields();

-- 月末実在庫（棚卸）と差分理由
create table public.stock_counts (
  id           bigint generated always as identity primary key,
  product_id   bigint not null references public.products (id),
  store_id     bigint not null references public.stores (id),
  month        date not null,             -- 月初日（その月の月末棚卸を表す）
  counted_qty  numeric(10,2) not null check (counted_qty >= 0),
  diff_reason  text,                      -- 理論在庫との差分理由メモ
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid default auth.uid(),
  updated_by   uuid default auth.uid(),
  unique (product_id, store_id, month)
);

create trigger trg_stock_counts_audit before update on public.stock_counts
  for each row execute function public.set_audit_fields();

-- RLS: 入庫・棚卸は現場スタッフも入力する / マスタと消費量設定は管理者
alter table public.products enable row level security;
create policy products_select on public.products for select
  using (public.is_active_staff());
create policy products_admin_write on public.products for all
  using (public.is_admin()) with check (public.is_admin());

alter table public.stock_entries enable row level security;
create policy stock_entries_staff on public.stock_entries for all
  using (public.is_active_staff()) with check (public.is_active_staff());

alter table public.menu_consumptions enable row level security;
create policy menu_consumptions_select on public.menu_consumptions for select
  using (public.is_active_staff());
create policy menu_consumptions_admin_write on public.menu_consumptions for all
  using (public.is_admin()) with check (public.is_admin());

alter table public.stock_counts enable row level security;
create policy stock_counts_staff on public.stock_counts for all
  using (public.is_active_staff()) with check (public.is_active_staff());

-- ================================================================
-- ストレージバケット（すべて非公開・署名URLで配信）
-- ================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('documents',      'documents',      false, 5242880,
   array['image/png', 'image/jpeg']),                       -- 署名画像
  ('board-files',    'board-files',    false, 20971520, null), -- 掲示板の添付（20MB）
  ('inventory-docs', 'inventory-docs', false, 10485760,
   array['image/png', 'image/jpeg', 'image/webp'])          -- 納品書画像
on conflict (id) do nothing;

create policy documents_storage_select on storage.objects for select
  using (bucket_id = 'documents' and public.is_active_staff());
-- 署名画像の書き込みは service role のみ（公開フォーム経由）。staff の insert は不要

create policy board_files_select on storage.objects for select
  using (bucket_id = 'board-files' and public.is_active_staff());
create policy board_files_admin_write on storage.objects for insert
  with check (bucket_id = 'board-files' and public.is_admin());
create policy board_files_admin_delete on storage.objects for delete
  using (bucket_id = 'board-files' and public.is_admin());

create policy inventory_docs_select on storage.objects for select
  using (bucket_id = 'inventory-docs' and public.is_active_staff());
create policy inventory_docs_insert on storage.objects for insert
  with check (bucket_id = 'inventory-docs' and public.is_active_staff());
