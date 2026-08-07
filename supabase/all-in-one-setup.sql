-- ============================================================
-- all-in-one-setup.sql : ノーブル業務システム 一括セットアップ
--
-- 新規の Supabase プロジェクトで、SQL Editor にこのファイル全体を
-- 貼り付けて1回実行するだけで、以下がすべて作成されます:
--   ・全テーブル / RLS / 関数 / ストレージバケット（migrations 001〜024）
--   ・カウンセリング項目・統合同意書「施術説明書・同意書」
--   ・施術部位15種 / 店舗3件 / オーナーアカウント marin
--   ・店舗別 LINE Messaging API 連携テーブル（store_line_configs / line_friends）
--
-- ※ 空のプロジェクト専用です。すでにテーブルがある場合は実行しないで
--    ください（その場合は supabase/migrations/ を個別に適用）。
-- ============================================================


-- ████████ 001_core.sql ████████

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

-- ████████ 002_masters.sql ████████

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

-- ████████ 003_customers.sql ████████

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

-- ████████ 004_visits.sql ████████

-- ============================================================
-- 004_visits.sql : 来店記録（カルテ）・施術メニュー/部位・写真
--
-- ロールバック手順:
--   drop table if exists public.visit_photos cascade;
--   drop table if exists public.visit_body_parts cascade;
--   drop table if exists public.visit_menus cascade;
--   drop table if exists public.visits cascade;
-- ============================================================

create table public.visits (
  id              bigint generated always as identity primary key,
  customer_id     bigint not null references public.customers (id) on delete cascade,
  store_id        bigint not null references public.stores (id),
  staff_id        bigint references public.staff (id),
  scheduled_at    timestamptz not null,
  -- scheduled = 空の箱（朝に事前作成）/ filled = 施術後に記入済み
  status          text not null default 'scheduled'
                  check (status in ('scheduled', 'filled')),
  memo            text,
  important_memo  text,    -- ピン留め重要事項：次回来店時に必ず目に入る位置へ表示
  filled_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid(),
  updated_by      uuid default auth.uid()
);

create trigger trg_visits_audit before update on public.visits
  for each row execute function public.set_audit_fields();

create index idx_visits_scheduled_at on public.visits (scheduled_at);
create index idx_visits_customer     on public.visits (customer_id, scheduled_at desc);
create index idx_visits_store_status on public.visits (store_id, status);

-- ----------------------------------------------------------------
-- 施術メニュー（多対多）
-- ----------------------------------------------------------------
create table public.visit_menus (
  visit_id    bigint not null references public.visits (id) on delete cascade,
  menu_id     bigint not null references public.menus (id),
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  primary key (visit_id, menu_id)
);

-- ----------------------------------------------------------------
-- 施術部位（多対多）— §10「施術部位ごとの月次回数」分析の元データ
-- ----------------------------------------------------------------
create table public.visit_body_parts (
  visit_id      bigint not null references public.visits (id) on delete cascade,
  body_part_id  bigint not null references public.body_parts (id),
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  primary key (visit_id, body_part_id)
);

create index idx_visit_body_parts_part on public.visit_body_parts (body_part_id, created_at);

-- ----------------------------------------------------------------
-- 施術前後の写真（Supabase Storage のパスを保持）
-- ----------------------------------------------------------------
create table public.visit_photos (
  id            bigint generated always as identity primary key,
  visit_id      bigint not null references public.visits (id) on delete cascade,
  kind          text not null check (kind in ('before', 'after')),
  storage_path  text not null,
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid()
);

create index idx_visit_photos_visit on public.visit_photos (visit_id);

-- ████████ 005_tickets.sql ████████

-- ============================================================
-- 005_tickets.sql : 顧客保有回数券・消化履歴・消化/取消関数・残高ビュー
--
-- 回数券は前受金。残回数の増減は必ず use_ticket / cancel_ticket_usage
-- 経由で行い、行ロックで二重消化を防ぐ。
--
-- ロールバック手順:
--   drop view if exists public.ticket_balances;
--   drop function if exists public.use_ticket(bigint, bigint);
--   drop function if exists public.cancel_ticket_usage(bigint);
--   drop function if exists public.admin_ticket_summary();
--   drop table if exists public.ticket_usages cascade;
--   drop table if exists public.customer_tickets cascade;
-- ============================================================

create table public.customer_tickets (
  id               bigint generated always as identity primary key,
  customer_id      bigint not null references public.customers (id) on delete cascade,
  product_id       bigint not null references public.ticket_products (id),
  store_id         bigint references public.stores (id),  -- 販売店舗
  purchased_at     date not null default (now() at time zone 'Asia/Tokyo')::date,
  expires_at       date not null,
  total_count      int not null check (total_count > 0),
  remaining_count  int not null check (remaining_count >= 0),
  price            int not null check (price >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid default auth.uid(),
  updated_by       uuid default auth.uid(),
  check (remaining_count <= total_count)
);

create trigger trg_customer_tickets_audit before update on public.customer_tickets
  for each row execute function public.set_audit_fields();

create index idx_customer_tickets_customer on public.customer_tickets (customer_id, expires_at);

-- ----------------------------------------------------------------
-- 消化履歴（取消は行削除ではなく canceled_at を立てる＝監査証跡）
-- ----------------------------------------------------------------
create table public.ticket_usages (
  id                  bigint generated always as identity primary key,
  customer_ticket_id  bigint not null references public.customer_tickets (id) on delete cascade,
  visit_id            bigint references public.visits (id) on delete set null,
  used_at             timestamptz not null default now(),
  canceled_at         timestamptz,
  created_at          timestamptz not null default now(),
  created_by          uuid default auth.uid(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid default auth.uid()
);

create trigger trg_ticket_usages_audit before update on public.ticket_usages
  for each row execute function public.set_audit_fields();

create index idx_ticket_usages_ticket on public.ticket_usages (customer_ticket_id);
create index idx_ticket_usages_visit  on public.ticket_usages (visit_id);

-- ----------------------------------------------------------------
-- 1回消化（行ロック・残回数チェック付き）。戻り値 = 作成した usage の id
-- ----------------------------------------------------------------
create or replace function public.use_ticket(p_customer_ticket_id bigint, p_visit_id bigint)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_remaining int;
  v_usage_id bigint;
begin
  if not public.is_active_staff() then
    raise exception 'permission denied';
  end if;

  select remaining_count into v_remaining
  from public.customer_tickets
  where id = p_customer_ticket_id
  for update;

  if v_remaining is null then
    raise exception '回数券が見つかりません';
  end if;
  if v_remaining <= 0 then
    raise exception '残回数がありません';
  end if;

  insert into public.ticket_usages (customer_ticket_id, visit_id, created_by, updated_by)
  values (p_customer_ticket_id, p_visit_id, auth.uid(), auth.uid())
  returning id into v_usage_id;

  update public.customer_tickets
  set remaining_count = remaining_count - 1,
      updated_at = now(), updated_by = auth.uid()
  where id = p_customer_ticket_id;

  return v_usage_id;
end;
$$;

-- ----------------------------------------------------------------
-- 消化の取り消し（誤操作対応）
-- ----------------------------------------------------------------
create or replace function public.cancel_ticket_usage(p_usage_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_ticket_id bigint;
begin
  if not public.is_active_staff() then
    raise exception 'permission denied';
  end if;

  select customer_ticket_id into v_ticket_id
  from public.ticket_usages
  where id = p_usage_id and canceled_at is null
  for update;

  if v_ticket_id is null then
    raise exception '取り消し対象の消化記録が見つかりません';
  end if;

  -- 親チケットをロックしてから加算
  perform 1 from public.customer_tickets where id = v_ticket_id for update;

  update public.ticket_usages
  set canceled_at = now(), updated_at = now(), updated_by = auth.uid()
  where id = p_usage_id;

  update public.customer_tickets
  set remaining_count = remaining_count + 1,
      updated_at = now(), updated_by = auth.uid()
  where id = v_ticket_id;
end;
$$;

-- ----------------------------------------------------------------
-- 未消化残高ビュー: 残額 = 残回数 × 単価（購入金額 ÷ 総回数）
-- security_invoker = 呼び出し元の RLS を適用
-- ----------------------------------------------------------------
create view public.ticket_balances
with (security_invoker = true)
as
select
  ct.id,
  ct.customer_id,
  ct.store_id,
  ct.product_id,
  ct.purchased_at,
  ct.expires_at,
  ct.total_count,
  ct.remaining_count,
  ct.price,
  round(ct.remaining_count * (ct.price::numeric / ct.total_count)) as unused_amount,
  (ct.expires_at < (now() at time zone 'Asia/Tokyo')::date)        as is_expired,
  (ct.expires_at <= (now() at time zone 'Asia/Tokyo')::date + 30)  as expires_soon
from public.customer_tickets ct;

-- ----------------------------------------------------------------
-- 店舗別・全体の未消化残高サマリー（管理者専用 — ダッシュボードKPI連動）
-- ----------------------------------------------------------------
create or replace function public.admin_ticket_summary()
returns table (store_id bigint, ticket_count bigint, unused_amount numeric)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'permission denied: admin only';
  end if;

  return query
  select
    ct.store_id,
    count(*) filter (where ct.remaining_count > 0),
    coalesce(sum(round(ct.remaining_count * (ct.price::numeric / ct.total_count))), 0)
  from public.customer_tickets ct
  where ct.expires_at >= (now() at time zone 'Asia/Tokyo')::date
  group by ct.store_id;
end;
$$;

-- ████████ 006_rls.sql ████████

-- ============================================================
-- 006_rls.sql : RLS（行レベルセキュリティ）ポリシー
--
-- 方針:
--   - 全テーブルで RLS を有効化。未ログイン／staff 行のない auth ユーザーは一切不可
--   - マスタ系: 閲覧 = 全スタッフ / 変更 = 管理者のみ
--   - 顧客・カルテ・回数券: 閲覧・入力 = 全スタッフ（全店舗横断）/ 削除 = 管理者のみ
--   - 分析系（スタッフ別実績・残高サマリー）: 関数内で is_admin() を強制
--
-- ロールバック手順（ポリシーのみ外す場合）:
--   各テーブルに対して
--     alter table public.<table> disable row level security;
--   を実行（ポリシーは残るが無効化される）。完全削除は drop policy を併用。
-- ============================================================

-- ---------------- stores ----------------
alter table public.stores enable row level security;
create policy stores_select on public.stores for select
  using (public.is_active_staff());
create policy stores_admin_write on public.stores for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------- staff ----------------
alter table public.staff enable row level security;
-- 名前・絵文字などは全スタッフが参照（担当者選択に必要）
create policy staff_select on public.staff for select
  using (public.is_active_staff());
create policy staff_admin_write on public.staff for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------- マスタ系 ----------------
alter table public.menus enable row level security;
create policy menus_select on public.menus for select
  using (public.is_active_staff());
create policy menus_admin_write on public.menus for all
  using (public.is_admin()) with check (public.is_admin());

alter table public.body_parts enable row level security;
create policy body_parts_select on public.body_parts for select
  using (public.is_active_staff());
create policy body_parts_admin_write on public.body_parts for all
  using (public.is_admin()) with check (public.is_admin());

alter table public.flag_types enable row level security;
create policy flag_types_select on public.flag_types for select
  using (public.is_active_staff());
create policy flag_types_admin_write on public.flag_types for all
  using (public.is_admin()) with check (public.is_admin());

alter table public.ticket_products enable row level security;
create policy ticket_products_select on public.ticket_products for select
  using (public.is_active_staff());
create policy ticket_products_admin_write on public.ticket_products for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------- 顧客系（スタッフ全員が読み書き・削除は管理者） ----------------
alter table public.customers enable row level security;
create policy customers_select on public.customers for select
  using (public.is_active_staff());
create policy customers_insert on public.customers for insert
  with check (public.is_active_staff());
create policy customers_update on public.customers for update
  using (public.is_active_staff()) with check (public.is_active_staff());
create policy customers_admin_delete on public.customers for delete
  using (public.is_admin());

alter table public.customer_flags enable row level security;
create policy customer_flags_select on public.customer_flags for select
  using (public.is_active_staff());
create policy customer_flags_insert on public.customer_flags for insert
  with check (public.is_active_staff());
create policy customer_flags_update on public.customer_flags for update
  using (public.is_active_staff()) with check (public.is_active_staff());
create policy customer_flags_admin_delete on public.customer_flags for delete
  using (public.is_admin());

alter table public.customer_notes enable row level security;
create policy customer_notes_select on public.customer_notes for select
  using (public.is_active_staff());
create policy customer_notes_insert on public.customer_notes for insert
  with check (public.is_active_staff());
create policy customer_notes_update on public.customer_notes for update
  using (public.is_active_staff()) with check (public.is_active_staff());
create policy customer_notes_admin_delete on public.customer_notes for delete
  using (public.is_admin());

-- ---------------- 来店記録（カルテ） ----------------
alter table public.visits enable row level security;
create policy visits_select on public.visits for select
  using (public.is_active_staff());
create policy visits_insert on public.visits for insert
  with check (public.is_active_staff());
create policy visits_update on public.visits for update
  using (public.is_active_staff()) with check (public.is_active_staff());
create policy visits_delete on public.visits for delete
  using (public.is_active_staff());  -- 朝作った空の箱の削除はスタッフにも必要

alter table public.visit_menus enable row level security;
create policy visit_menus_all on public.visit_menus for all
  using (public.is_active_staff()) with check (public.is_active_staff());

alter table public.visit_body_parts enable row level security;
create policy visit_body_parts_all on public.visit_body_parts for all
  using (public.is_active_staff()) with check (public.is_active_staff());

alter table public.visit_photos enable row level security;
create policy visit_photos_all on public.visit_photos for all
  using (public.is_active_staff()) with check (public.is_active_staff());

-- ---------------- 回数券 ----------------
alter table public.customer_tickets enable row level security;
create policy customer_tickets_select on public.customer_tickets for select
  using (public.is_active_staff());
create policy customer_tickets_insert on public.customer_tickets for insert
  with check (public.is_active_staff());
-- 残回数の増減は use_ticket / cancel_ticket_usage（security definer）経由。
-- 直接 update は管理者のみ（誤入力の修正用）
create policy customer_tickets_admin_update on public.customer_tickets for update
  using (public.is_admin()) with check (public.is_admin());
create policy customer_tickets_admin_delete on public.customer_tickets for delete
  using (public.is_admin());

alter table public.ticket_usages enable row level security;
create policy ticket_usages_select on public.ticket_usages for select
  using (public.is_active_staff());
-- 作成・取消は関数経由（security definer）のため、直接の insert/update/delete は管理者のみ
create policy ticket_usages_admin_write on public.ticket_usages for all
  using (public.is_admin()) with check (public.is_admin());

-- ████████ 007_storage.sql ████████

-- ============================================================
-- 007_storage.sql : 施術写真用ストレージバケット（非公開・署名URLで表示）
--
-- ロールバック手順:
--   delete from storage.objects where bucket_id = 'visit-photos';
--   delete from storage.buckets where id = 'visit-photos';
--   drop policy if exists visit_photos_storage_select on storage.objects;
--   drop policy if exists visit_photos_storage_insert on storage.objects;
--   drop policy if exists visit_photos_storage_delete on storage.objects;
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'visit-photos',
  'visit-photos',
  false,                          -- 非公開（顧客の肌写真のため）
  10485760,                       -- 10MB（クライアント側で圧縮してからアップロード）
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy visit_photos_storage_select on storage.objects for select
  using (bucket_id = 'visit-photos' and public.is_active_staff());

create policy visit_photos_storage_insert on storage.objects for insert
  with check (bucket_id = 'visit-photos' and public.is_active_staff());

create policy visit_photos_storage_delete on storage.objects for delete
  using (bucket_id = 'visit-photos' and public.is_active_staff());

-- ████████ 009_sales.sql ████████

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

-- ████████ 011_shifts.sql ████████

-- ============================================================
-- 011_shifts.sql : フェーズ2 シフト・共有カレンダー（TimeTree代替）
--   希望（shift_requests）/ 確定（shifts）/ 実績（attendance_records）を
--   分離して保持（将来のAIシフト案生成・社労士提出CSVを見据えた構造）
--
-- ロールバック手順:
--   drop function if exists public.acknowledge_shift(bigint);
--   drop table if exists public.attendance_records cascade;
--   drop table if exists public.calendar_events cascade;
--   drop table if exists public.shifts cascade;
--   drop table if exists public.shift_requests cascade;
--   drop table if exists public.shift_recruitments cascade;
-- ============================================================

-- ----------------------------------------------------------------
-- シフト募集（管理者が対象月の希望受付を開始・締切）
-- ----------------------------------------------------------------
create table public.shift_recruitments (
  id          bigint generated always as identity primary key,
  month       date not null unique,          -- 月初日
  status      text not null default 'open' check (status in ('open', 'closed')),
  note        text,                          -- 例: 「15日までに提出してください」
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_by  uuid default auth.uid()
);

create trigger trg_shift_recruitments_audit before update on public.shift_recruitments
  for each row execute function public.set_audit_fields();

-- ----------------------------------------------------------------
-- シフト希望（スタッフが日別に提出）
--   ok=○ / ng=× / time=時間帯指定 / usual=いつも通り / any=お任せ
-- ----------------------------------------------------------------
create table public.shift_requests (
  id          bigint generated always as identity primary key,
  staff_id    bigint not null references public.staff (id) on delete cascade,
  month       date not null,                 -- 月初日（募集との対応）
  date        date not null,
  type        text not null check (type in ('ok', 'ng', 'time', 'usual', 'any')),
  start_time  time,                          -- type='time' のとき使用
  end_time    time,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_by  uuid default auth.uid(),
  unique (staff_id, date)
);

create trigger trg_shift_requests_audit before update on public.shift_requests
  for each row execute function public.set_audit_fields();

create index idx_shift_requests_month on public.shift_requests (month, staff_id);

-- ----------------------------------------------------------------
-- シフト（管理者が作成。draft=調整中 → confirmed=確定）
--   acknowledged_at: スタッフ本人の「確認済み」チェック
-- ----------------------------------------------------------------
create table public.shifts (
  id               bigint generated always as identity primary key,
  staff_id         bigint not null references public.staff (id) on delete cascade,
  store_id         bigint not null references public.stores (id),
  date             date not null,
  start_time       time not null,
  end_time         time not null,
  status           text not null default 'draft' check (status in ('draft', 'confirmed')),
  acknowledged_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid default auth.uid(),
  updated_by       uuid default auth.uid(),
  unique (staff_id, date),
  check (end_time > start_time)
);

create trigger trg_shifts_audit before update on public.shifts
  for each row execute function public.set_audit_fields();

create index idx_shifts_date on public.shifts (date, store_id);

-- ----------------------------------------------------------------
-- 勤務実績（確定シフトに対する実働。早退・残業は理由付き）
-- ----------------------------------------------------------------
create table public.attendance_records (
  id            bigint generated always as identity primary key,
  shift_id      bigint not null unique references public.shifts (id) on delete cascade,
  actual_start  time not null,
  actual_end    time not null,
  diff_reason   text,                        -- 予定とずれた場合の理由（残業・早退など）
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  updated_by    uuid default auth.uid(),
  check (actual_end > actual_start)
);

create trigger trg_attendance_records_audit before update on public.attendance_records
  for each row execute function public.set_audit_fields();

-- ----------------------------------------------------------------
-- 共有カレンダーの予定（シフト以外）
--   type: off=休み / task=定期タスク / training=研修 / meeting=ミーティング /
--         practice=練習モデル / shooting=撮影 / closing=月末・締め作業 /
--         todo=TODO / change=変更（赤系で強調）
--   repeat_weekday: 0(日)〜6(土) を指定すると毎週その曜日に表示（ゴミ出し等）
-- ----------------------------------------------------------------
create table public.calendar_events (
  id              bigint generated always as identity primary key,
  store_id        bigint references public.stores (id),   -- null = 全店舗
  date            date not null,                          -- 繰り返しの場合は開始日
  type            text not null check (type in
    ('off', 'task', 'training', 'meeting', 'practice', 'shooting', 'closing', 'todo', 'change')),
  title           text not null,
  repeat_weekday  int check (repeat_weekday between 0 and 6),
  repeat_until    date,                                   -- 繰り返し終了日（null = 無期限）
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid(),
  updated_by      uuid default auth.uid()
);

create trigger trg_calendar_events_audit before update on public.calendar_events
  for each row execute function public.set_audit_fields();

create index idx_calendar_events_date on public.calendar_events (date);

-- ----------------------------------------------------------------
-- 確認済みチェック（本人の確定シフトのみ。security definer で所有者検証）
-- ----------------------------------------------------------------
create or replace function public.acknowledge_shift(p_shift_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.shifts
  set acknowledged_at = now(), updated_at = now(), updated_by = auth.uid()
  where id = p_shift_id
    and status = 'confirmed'
    and acknowledged_at is null
    and staff_id = public.current_staff_id();

  if not found then
    raise exception '確認できるシフトが見つかりません';
  end if;
end;
$$;

-- ----------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------

-- 募集: 閲覧=全スタッフ / 開始・締切=管理者
alter table public.shift_recruitments enable row level security;
create policy shift_recruitments_select on public.shift_recruitments for select
  using (public.is_active_staff());
create policy shift_recruitments_admin_write on public.shift_recruitments for all
  using (public.is_admin()) with check (public.is_admin());

-- 希望: 本人は自分の希望を読み書き / 管理者は全件
alter table public.shift_requests enable row level security;
create policy shift_requests_own on public.shift_requests for all
  using (staff_id = public.current_staff_id() or public.is_admin())
  with check (staff_id = public.current_staff_id() or public.is_admin());

-- シフト: 確定分は全スタッフが閲覧（共有カレンダー）。ドラフトは管理者のみ。
-- 作成・変更は管理者のみ（確認済みチェックは acknowledge_shift 関数経由）
alter table public.shifts enable row level security;
create policy shifts_select on public.shifts for select
  using (public.is_active_staff() and (status = 'confirmed' or public.is_admin()));
create policy shifts_admin_write on public.shifts for insert
  with check (public.is_admin());
create policy shifts_admin_update on public.shifts for update
  using (public.is_admin()) with check (public.is_admin());
create policy shifts_admin_delete on public.shifts for delete
  using (public.is_admin());

-- 勤務実績: 本人のシフト分は読み書き可 / 管理者は全件
alter table public.attendance_records enable row level security;
create policy attendance_own on public.attendance_records for all
  using (
    public.is_admin() or exists (
      select 1 from public.shifts s
      where s.id = shift_id and s.staff_id = public.current_staff_id()
    )
  )
  with check (
    public.is_admin() or exists (
      select 1 from public.shifts s
      where s.id = shift_id and s.staff_id = public.current_staff_id()
    )
  );

-- 共有カレンダー: 閲覧・追加・更新=全スタッフ（TimeTreeの共有文化を踏襲）
-- 削除=作成者本人 or 管理者
alter table public.calendar_events enable row level security;
create policy calendar_events_select on public.calendar_events for select
  using (public.is_active_staff());
create policy calendar_events_insert on public.calendar_events for insert
  with check (public.is_active_staff());
create policy calendar_events_update on public.calendar_events for update
  using (public.is_active_staff()) with check (public.is_active_staff());
create policy calendar_events_delete on public.calendar_events for delete
  using (public.is_admin() or created_by = auth.uid());

-- ████████ 013_phase3.sql ████████

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

-- ████████ 014_no_default_emoji.sql ████████

-- ============================================================
-- 014_no_default_emoji.sql : スタッフの絵文字アイコンを既定で空にする
--   （絵文字はカレンダーチップ用のオプション。必要な場合のみ
--     マスタ管理から個別に設定する）
--
-- ロールバック手順:
--   alter table public.staff alter column icon_emoji set default '🐰';
-- ============================================================

alter table public.staff alter column icon_emoji set default '';

-- ████████ 015_counseling_v2.sql ████████

-- ============================================================
-- 015_counseling_v2.sql : カウンセリング強化
--   ① 質問形式に「ack（注意事項の確認チェック）」を追加
--      （options 列に注意事項の本文を入れ、お客様が確認チェックを付ける）
--   ② カウンセリングシートをカルテ（visits）に紐付けられるようにする
--      （回答を見ながらそのままカルテ保存する運用のため）
--
-- ロールバック手順:
--   alter table public.counseling_sheets drop column if exists visit_id;
--   alter table public.counseling_questions drop constraint counseling_questions_field_type_check;
--   alter table public.counseling_questions add constraint counseling_questions_field_type_check
--     check (field_type in ('text', 'textarea', 'choice', 'multi', 'yes_no'));
-- ============================================================

alter table public.counseling_questions
  drop constraint counseling_questions_field_type_check;

alter table public.counseling_questions
  add constraint counseling_questions_field_type_check
  check (field_type in ('text', 'textarea', 'choice', 'multi', 'yes_no', 'ack'));

alter table public.counseling_sheets
  add column if not exists visit_id bigint references public.visits (id) on delete set null;

create index if not exists idx_counseling_sheets_visit on public.counseling_sheets (visit_id);

-- ████████ 016_intake.sql ████████

-- ============================================================
-- 016_intake.sql : LINEリッチメニュー等からの「受付」フロー対応
--   固定URL（/f/new）から、お客様自身が氏名・連絡先を入力して
--   カウンセリングを送信できるようにする。送信時点では顧客台帳に
--   紐付かない（customer_id = null）ため、スタッフが受信箱で確認し、
--   既存顧客への紐付け or 新規登録 を行う。
--
-- ロールバック手順:
--   drop index if exists idx_counseling_sheets_pending;
--   alter table public.counseling_sheets
--     drop column if exists applicant_name,
--     drop column if exists applicant_kana,
--     drop column if exists applicant_phone,
--     drop column if exists store_id;
--   -- customer_id を NOT NULL へ戻す場合（紐付け済みであること）:
--   -- alter table public.counseling_sheets alter column customer_id set not null;
-- ============================================================

-- 受付（未紐付け）を許可するため customer_id を nullable に
alter table public.counseling_sheets alter column customer_id drop not null;

-- お客様が入力する本人情報（紐付け前の照合用）
alter table public.counseling_sheets
  add column if not exists applicant_name  text,
  add column if not exists applicant_kana  text,
  add column if not exists applicant_phone text,
  add column if not exists store_id        bigint references public.stores (id);

-- 受信箱（未紐付けの送信済み）を高速に引くための部分インデックス
create index if not exists idx_counseling_sheets_pending
  on public.counseling_sheets (submitted_at desc)
  where customer_id is null and status = 'submitted';

-- ████████ 017_consent_chain.sql ████████

-- ============================================================
-- 017_consent_chain.sql : カウンセリング → 同意書署名 の連結対応
--   ・公開フロー（顧客台帳に未紐付け）でも同意書を発行・署名できるよう
--     consent_documents.customer_id を nullable にし、counseling_sheet_id を追加
--   ・希望メニューと同意書テンプレートを結びつける menu_tag を追加
--
-- ロールバック手順:
--   alter table public.consent_documents drop column if exists counseling_sheet_id;
--   alter table public.consent_templates drop column if exists menu_tag;
--   -- customer_id を NOT NULL に戻す場合（紐付け済みであること）:
--   -- alter table public.consent_documents alter column customer_id set not null;
-- ============================================================

alter table public.consent_documents alter column customer_id drop not null;

alter table public.consent_documents
  add column if not exists counseling_sheet_id bigint references public.counseling_sheets (id) on delete set null;

create index if not exists idx_consent_documents_sheet
  on public.consent_documents (counseling_sheet_id);

-- 希望メニュー → テンプレート紐付け用タグ
--   peeling_with / peeling_without / yomogi / hydra
alter table public.consent_templates
  add column if not exists menu_tag text;

-- ████████ 018_gallery.sql ████████

-- ============================================================
-- 018_gallery.sql : お客様にお見せするビフォーアフターページ
--   スタッフが選んだ写真で公開ページ（トークンURL）を作成し、
--   LINE等でお客様に共有する。公開ページは service role + 署名URLで配信。
--
-- ロールバック手順:
--   drop table if exists public.gallery_photos cascade;
--   drop table if exists public.gallery_pages cascade;
-- ============================================================

create table public.gallery_pages (
  id           bigint generated always as identity primary key,
  customer_id  bigint references public.customers (id) on delete set null,
  token        uuid not null unique default gen_random_uuid(),
  title        text not null default 'Before / After',
  message      text,                        -- お客様へのひとことメッセージ
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid default auth.uid(),
  updated_by   uuid default auth.uid()
);

create trigger trg_gallery_pages_audit before update on public.gallery_pages
  for each row execute function public.set_audit_fields();

create index idx_gallery_pages_customer on public.gallery_pages (customer_id);

-- ページに載せる写真（visit_photos の storage_path をコピー保持）
create table public.gallery_photos (
  id            bigint generated always as identity primary key,
  gallery_id    bigint not null references public.gallery_pages (id) on delete cascade,
  storage_path  text not null,             -- visit-photos バケットのパス
  kind          text not null check (kind in ('before', 'after')),
  caption       text,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid()
);

create index idx_gallery_photos_gallery on public.gallery_photos (gallery_id, sort_order);

-- RLS: 作成・編集はスタッフ。公開ページは service role 経由で読むため anon ポリシーは作らない
alter table public.gallery_pages enable row level security;
create policy gallery_pages_staff on public.gallery_pages for all
  using (public.is_active_staff()) with check (public.is_active_staff());

alter table public.gallery_photos enable row level security;
create policy gallery_photos_staff on public.gallery_photos for all
  using (public.is_active_staff()) with check (public.is_active_staff());

-- ████████ 019_visit_consumptions.sql ████████

-- ============================================================
-- 019_visit_consumptions.sql : カルテごとの実使用量（g等）記録
--   施術ごとに使用した商品と使用量をスタッフが入力する。
--   在庫の理論在庫計算や月次集計に利用する。
--
-- ロールバック手順:
--   drop table if exists public.visit_consumptions cascade;
-- ============================================================

create table public.visit_consumptions (
  id           bigint generated always as identity primary key,
  visit_id     bigint not null references public.visits (id) on delete cascade,
  product_id   bigint not null references public.products (id),
  amount       numeric(10,2) not null check (amount >= 0),  -- 単位は product.unit（g等）
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid default auth.uid(),
  updated_by   uuid default auth.uid(),
  unique (visit_id, product_id)
);

create trigger trg_visit_consumptions_audit before update on public.visit_consumptions
  for each row execute function public.set_audit_fields();

create index idx_visit_consumptions_visit on public.visit_consumptions (visit_id);
create index idx_visit_consumptions_product on public.visit_consumptions (product_id);

-- RLS: スタッフが入力（カルテ同様）
alter table public.visit_consumptions enable row level security;
create policy visit_consumptions_staff on public.visit_consumptions for all
  using (public.is_active_staff()) with check (public.is_active_staff());

-- ████████ 020_body_parts.sql ████████

-- ============================================================
-- 020_body_parts.sql : 施術部位マスタを15部位に更新（剥離ありハーブピーリング対応）
--   顔／顔顎下／顔首／背中上／背中下／背中全体／二の腕／前腕／
--   デコルテ／おしり／お腹／膝上表／膝上裏／膝下表／膝下裏
--
-- 既存の visit_body_parts（カルテの部位記録）を壊さないため、削除はせず
-- 一覧にない部位を is_active=false にし、15部位を有効化・並べ替える。
--
-- ロールバック手順:
--   （旧マスタへ戻す場合は手動で is_active と sort_order を調整してください）
-- ============================================================

-- 15部位を投入（同名があればスキップ）
insert into public.body_parts (name, sort_order)
select v.name, v.ord
from (values
  ('顔', 1), ('顔顎下', 2), ('顔首', 3),
  ('背中上', 4), ('背中下', 5), ('背中全体', 6),
  ('二の腕', 7), ('前腕', 8), ('デコルテ', 9),
  ('おしり', 10), ('お腹', 11),
  ('膝上表', 12), ('膝上裏', 13), ('膝下表', 14), ('膝下裏', 15)
) as v(name, ord)
where not exists (select 1 from public.body_parts b where b.name = v.name);

-- 15部位を有効化＋並び順を更新
update public.body_parts b
set is_active = true, sort_order = v.ord, updated_at = now()
from (values
  ('顔', 1), ('顔顎下', 2), ('顔首', 3),
  ('背中上', 4), ('背中下', 5), ('背中全体', 6),
  ('二の腕', 7), ('前腕', 8), ('デコルテ', 9),
  ('おしり', 10), ('お腹', 11),
  ('膝上表', 12), ('膝上裏', 13), ('膝下表', 14), ('膝下裏', 15)
) as v(name, ord)
where b.name = v.name;

-- 一覧にない旧部位（背中上部・腕・脚 など）は非表示に
update public.body_parts
set is_active = false, updated_at = now()
where name not in (
  '顔','顔顎下','顔首','背中上','背中下','背中全体','二の腕','前腕',
  'デコルテ','おしり','お腹','膝上表','膝上裏','膝下表','膝下裏'
);

-- ████████ 021_consent_combined.sql ████████

-- ============================================================
-- 021_consent_combined.sql : 同意書を「施術説明書・同意書」（統合版）に差し替え
--   5施術（剥離ハーブピーリング／クリスティーナハーブピーリング(ビオフィート)／
--   よもぎ蒸し／ハイドラフェイシャル／エレクトロポーション）を1枚にまとめ、
--   カウンセリング後に必ず提示・署名する。
--
--   menu_tag = 'all' のテンプレートは、希望メニューに関わらず常に提示される。
--
-- ロールバック手順:
--   update public.consent_templates set is_active = true
--     where menu_tag in ('peeling_with','peeling_without','yomogi','hydra');
--   update public.consent_templates set is_active = false where menu_tag = 'all';
-- ============================================================

-- 旧・メニュー別テンプレートを無効化（記録は残す）
update public.consent_templates
set is_active = false, updated_at = now()
where menu_tag in ('peeling_with', 'peeling_without', 'yomogi', 'hydra');

-- 統合版「施術説明書・同意書」を投入（既にあればスキップ）
insert into public.consent_templates (title, body, menu_tag, sort_order, is_active)
select
  '施術説明書・同意書',
  E'■ 本日受ける施術\n□ 剥離ハーブピーリング　□ クリスティーナハーブピーリング(ビオフィート)　□ よもぎ蒸し\n□ ハイドラフェイシャル(mediAQUAウォーターピーリング)　□ エレクトロポーション\n\n'
  || E'【剥離ハーブピーリング】\n様々な肌トラブルの改善が期待できるものですが、剥離ハーブピーリングは素肌美を追求したトリートメントであり、医療行為ではありません。また、個人差はありますが、トリートメントの際にチクチクとした痛みが伴います。さらに、活性化による老廃物を外に出そうとする作用が起こる為、目やに・鼻水・腫れ・むくみ・赤み・だるさ・かゆみなどが出る場合や、一時的にシミ、くすみが押し上げられて濃く感じられることがありますが、このような症状は一時的なもので代謝とともに数日で治ります。また、お肌に合わない場合、強いアレルギー反応を起こす可能性もございます。そのような場合、ご使用をお控えください。剥離が始まってもご自身で剥かず、自然剥離させてください。※新陳代謝が悪い部分(背中下、腕、足)などは術後に色素沈着が残る場合がございます。個人差はありますが2ヶ月〜6ヶ月程度でお時間と共に薄くなりますのでご安心ください。\n\n'
  || E'【クリスティーナハーブピーリング(ビオフィート)】\nビオフィートとは、植物から抽出された有効成分の特性を最大限に引き出した、今までにないお肌のトリートメントです。外からの刺激を防御するバリア機能と、蓄積した余分な成分を解毒するデトックス目的で、お肌のバランスを整え、ご自身の力でお肌トラブルを改善する効果に優れています。一時的に赤みが生じる事がありますが、このような症状は一時的で代謝と共に数時間で治ります。また、お肌に合わない場合はご使用をお控えください。\n\n'
  || E'【よもぎ蒸し】\nよもぎ蒸しは韓国発祥の美容健康法です。施術はリラクゼーションを目的に行うものであり、お体の不具合を治す治療目的、医療目的にしたものではありません。施術後は、疲労感や好転反応が出ることがあります。妊娠中、並びに妊娠の可能性がある方、生理中の方、高血圧、飲酒中、風邪の方はお受けいただけません。\nその他の疾患、施術部位に腫瘍や湿疹、常用している薬がある、心臓病、高血圧、糖尿病等、持病を抱えている、外科的・内科的治療を行っている、1年以内に手術を受けているなど、その他通院中や気になる症状がある場合は、必ず事前に医師にご相談ください。\n\n'
  || E'【ハイドラフェイシャル(毛穴洗浄:mediAQUAウォーターピーリング)】\n植物由来のエキス配合の美容液と独自テクノロジーを用いたアクアトリートメントです。肌に一時的な刺激、ツッパリ感、赤みを感じることがあります。これらはすべて正常な反応で皮膚の感受性によりますが、通常は1〜3日以内に解消します。施術部位にひりひりした感覚またはチクチクとした感覚を感じることがあります。これらの感覚は通常、数時間以内に治ります。施術後は肌の日焼けや、日焼けによるダメージを受けやすくなります。日光への過度の暴露を避け、日焼け止めを使用してください。また、化粧水、乳液、クリーム等で通常よりもしっかりと保湿をお願いいたします。\n\n'
  || E'【エレクトロポレーション】\n電気の力を利用し、皮膚に小さな隙間を作り、チップの先端で美容液を分子サイズにし、美容成分を肌の奥まで浸透させます。まれに赤み、むくみが出る場合があります。\n\n'
  || E'◆ 下記の注意事項を必ずお守りください\n□ カウンセリングの際に詳細を記載、申告すること\n□ 担当者の説明を理解し、施術後の注意事項を守り、ホームケアを行うこと\n□ 施術後はむやみに触れずに、刺激を与えないこと\n\n'
  || E'各施術につきましては、多分に個人差や健康状態の影響があることをご承知いただき、カウンセリングの際に申告されなかった事項、禁忌事項を守らずに起きたトラブルに関しましては、当店では一切の責任を負いかねますことをご了承ください。施術の際に撮影させていただいた写真に関しましては、お客様のカルテおよび当店で直接運用するホームページ、SNS等に利用させていただくことがございます。また、上記内容をご理解・ご納得された上でご署名された場合、いかなる理由でありましても施術後の料金の払い戻しはお受けいたしません。\n\n'
  || E'ご記入のお間違いがないかご確認の上、ご署名をお願いいたします。施術を受けるにあたり、施術の説明を受けて十分理解し、上記内容に納得して施術を受けることを同意します。',
  'all',
  0,
  true
where not exists (
  select 1 from public.consent_templates t where t.title = '施術説明書・同意書'
);

-- ████████ 022_line_api.sql ████████

-- ============================================================
-- 022_line_api.sql : 店舗ごとの LINE Messaging API 連携（案B）
--   ・store_line_configs : 店舗ごとのチャネルアクセストークン／シークレット
--   ・line_friends       : 友だち（LINEユーザー）と顧客の紐付け
--
--   トークン等の秘匿情報は管理者のみ。実際の送受信はサーバー側
--   （service role / Webhook）で行うため、anon には開放しない。
--
-- ロールバック手順:
--   drop table if exists public.line_friends cascade;
--   drop table if exists public.store_line_configs cascade;
-- ============================================================

-- 店舗ごとの LINE チャネル設定
create table public.store_line_configs (
  id                    bigint generated always as identity primary key,
  store_id              bigint not null unique references public.stores (id) on delete cascade,
  channel_access_token  text,                 -- 長期チャネルアクセストークン
  channel_secret        text,                 -- 署名検証用
  bot_basic_id          text,                 -- 公式アカウントの @ID（任意・表示用）
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid default auth.uid(),
  updated_by            uuid default auth.uid()
);

create trigger trg_store_line_configs_audit before update on public.store_line_configs
  for each row execute function public.set_audit_fields();

-- 友だち（LINEユーザー）。Webhook で受信し、顧客に紐付ける
create table public.line_friends (
  id              bigint generated always as identity primary key,
  store_id        bigint not null references public.stores (id) on delete cascade,
  line_user_id    text not null,
  display_name    text,
  picture_url     text,
  customer_id     bigint references public.customers (id) on delete set null,
  is_blocked      boolean not null default false,  -- ブロック（unfollow）状態
  followed_at     timestamptz,
  last_event_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid(),
  updated_by      uuid default auth.uid(),
  unique (store_id, line_user_id)
);

create trigger trg_line_friends_audit before update on public.line_friends
  for each row execute function public.set_audit_fields();

create index idx_line_friends_store on public.line_friends (store_id) where customer_id is null;
create index idx_line_friends_customer on public.line_friends (customer_id);

-- RLS
alter table public.store_line_configs enable row level security;
-- 設定（トークン）は管理者のみ
create policy store_line_configs_admin on public.store_line_configs for all
  using (public.is_admin()) with check (public.is_admin());

alter table public.line_friends enable row level security;
-- 友だち一覧はスタッフが閲覧・顧客紐付け（update）可能。挿入/削除は管理者
create policy line_friends_select on public.line_friends for select
  using (public.is_active_staff());
create policy line_friends_update on public.line_friends for update
  using (public.is_active_staff()) with check (public.is_active_staff());
create policy line_friends_admin_write on public.line_friends for insert
  with check (public.is_admin());
create policy line_friends_admin_delete on public.line_friends for delete
  using (public.is_admin());

-- ████████ 024_staff_pay.sql ████████

-- ============================================================
-- 024_staff_pay.sql : シフトの報酬・交通費自動計算用マスタ
--   ・時間給（スタッフごと）
--   ・交通費 往復/日（スタッフ × 店舗ごと。勤務店舗で支給額が異なるため）
--   報酬情報のため RLS は管理者専用（スタッフ本人にも非公開）
-- ============================================================

create table public.staff_pay_settings (
  staff_id     bigint primary key references public.staff (id) on delete cascade,
  hourly_wage  int not null default 0 check (hourly_wage >= 0),  -- 円/時
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid default auth.uid(),
  updated_by   uuid default auth.uid()
);

create trigger trg_staff_pay_settings_audit before update on public.staff_pay_settings
  for each row execute function public.set_audit_fields();

create table public.staff_transport_costs (
  id               bigint generated always as identity primary key,
  staff_id         bigint not null references public.staff (id) on delete cascade,
  store_id         bigint not null references public.stores (id) on delete cascade,
  round_trip_cost  int not null default 0 check (round_trip_cost >= 0),  -- 円/日（往復）
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid default auth.uid(),
  updated_by       uuid default auth.uid(),
  unique (staff_id, store_id)
);

create trigger trg_staff_transport_costs_audit before update on public.staff_transport_costs
  for each row execute function public.set_audit_fields();

alter table public.staff_pay_settings enable row level security;
create policy staff_pay_settings_admin on public.staff_pay_settings for all
  using (public.is_admin()) with check (public.is_admin());

alter table public.staff_transport_costs enable row level security;
create policy staff_transport_costs_admin on public.staff_transport_costs for all
  using (public.is_admin()) with check (public.is_admin());

-- ████████ counseling-seed.sql ████████

-- ============================================================
-- counseling-seed.sql : カウンセリング項目・同意書テンプレート（本番用）
--   対象メニュー: 剥離あり/なしハーブピーリング・よもぎ蒸し・ハイドラフェイシャル
--
-- 使い方: migrations（015まで）実行後、SQL Editor でこのファイルを実行。
--         既に同じ質問・テンプレートがある場合はスキップされます（再実行可）。
--
-- 内容はマスタ管理（経営 > マスタ管理 > カウンセリング項目／同意書テンプレ）
-- からいつでも編集できます。
-- ============================================================

-- ----------------------------------------------------------------
-- カウンセリング項目
-- ----------------------------------------------------------------
insert into public.counseling_questions (label, field_type, options, sort_order)
select v.label, v.field_type, v.options, v.sort_order
from (values

  -- 基本
  ('ご希望のメニューをお選びください', 'multi',
   'ハーブピーリング（剥離あり）,ハーブピーリング（剥離なし）,よもぎ蒸し,ハイドラフェイシャル,未定（カウンセリングで相談したい）', 10),

  ('本日のお悩み・ご希望をお聞かせください', 'multi',
   'ニキビ・ニキビ跡,毛穴の開き・黒ずみ,くすみ・色素沈着,乾燥,ハリ・たるみ,ごわつき・ザラつき,背中の肌荒れ,冷え・むくみ,リラックスしたい,その他', 20),

  ('ご自身のお肌質に近いものは？', 'choice',
   '普通肌,乾燥肌,脂性肌,混合肌,敏感肌,わからない', 30),

  -- 健康状態（全メニュー共通の禁忌確認）
  ('現在、妊娠中・授乳中ですか？', 'choice',
   '妊娠中,妊娠の可能性がある,授乳中,いいえ', 40),

  ('現在、通院中・治療中の疾患はありますか？（高血圧・心疾患・糖尿病・てんかん・皮膚疾患など）', 'choice',
   'ある,ない', 50),

  ('「ある」と答えた方は、差し支えない範囲で内容をお書きください', 'text', null, 51),

  ('服用中・使用中のお薬があればお書きください（特にビタミンA系＝レチノール・トレチノイン等の塗り薬/飲み薬は必ずご記入ください）', 'textarea', null, 60),

  ('アレルギーはありますか？（金属・植物（キク科/ヨモギ）・海藻・化粧品・お薬など）', 'textarea', null, 70),

  ('現在のお肌の状態で当てはまるものがあればお選びください', 'multi',
   '2週間以内に日焼けをした,ヘルペス（口唇ヘルペス含む）が出やすい,アトピー性皮膚炎,ケロイド体質,顔や施術部位に傷・炎症・湿疹がある,特になし', 80),

  ('直近1ヶ月以内に受けた美容施術があればお書きください（ピーリング・レーザー・脱毛・注入系など）', 'textarea', null, 90),

  ('本日の体調について当てはまるものは？', 'choice',
   '生理中,生理前後で肌がゆらぎやすい,体調がすぐれない,特に問題なし', 100),

  ('普段のスキンケア・ホームケアについて教えてください', 'textarea', null, 110),

  -- メニュー別の注意事項（確認チェック）
  ('【ハーブピーリング（剥離あり）の注意事項】', 'ack',
   E'・施術後3〜7日程度、赤み・ほてり・皮むけ（ダウンタイム）が生じます。ご予定に合わせてお受けください。\n・施術後12〜24時間は洗顔・メイク・入浴（湯船）をお控えください（シャワーは首から下のみ可）。\n・施術後1週間は日焼け止めを必ず使用し、強い紫外線・サウナ・激しい運動・飲酒をお控えください。\n・レチノール/トレチノイン等のビタミンA系は施術前後1週間お休みください。\n・妊娠中・授乳中の方、皮膚疾患治療中の方、日焼け直後の方は施術をお受けいただけない場合があります。\n・海藻・海綿（スポンジ）由来成分にアレルギーのある方は必ず事前にお申し出ください。\n・効果には個人差があります。', 200),

  ('【ハーブピーリング（剥離なし）の注意事項】', 'ack',
   E'・施術後、一時的に赤み・ほてりが出ることがありますが、通常は当日〜翌日で落ち着きます。\n・当日は長時間の入浴・サウナ・激しい運動・飲酒をお控えください。\n・施術後は保湿と日焼け止めの使用をおすすめします。\n・お肌の状態により、当日の施術内容を変更・中止させていただく場合があります。\n・効果には個人差があります。', 210),

  ('【よもぎ蒸しの注意事項】', 'ack',
   E'・妊娠中の方はご利用いただけません（妊娠の可能性がある方もお控えください）。\n・生理中のご利用はお控えください（生理前後はご相談ください）。\n・高血圧・心疾患・てんかん等の持病がある方は必ず事前にお申し出ください。\n・ヨモギ（キク科植物）アレルギーの方はご利用いただけません。\n・飲酒後・発熱時・体調不良時はご利用いただけません。\n・発汗を伴うため、施術前後は十分な水分補給をお願いします。のぼせ・めまいを感じた場合はすぐにお知らせください。', 220),

  ('【ハイドラフェイシャルの注意事項】', 'ack',
   E'・日焼け直後の方、施術部位に傷・炎症・ヘルペス（活動期）がある方は施術をお受けいただけない場合があります。\n・レチノール等のビタミンA系やピーリング系のホームケアは、施術前後2〜3日お休みください。\n・施術後、一時的に赤みやつっぱり感が出ることがあります。当日は保湿を丁寧に行い、日焼け止めを使用してください。\n・当日はスクラブ等の強い摩擦を伴うケア、サウナ・激しい運動をお控えください。\n・妊娠中・授乳中の方は事前にお申し出ください（内容を調整してご案内します）。\n・効果には個人差があります。', 230),

  ('当店をどこでお知りになりましたか？', 'choice',
   'ホットペッパービューティー,Instagram,ご紹介,Google検索,その他', 300),

  ('その他、スタッフに伝えておきたいこと・ご質問があればご自由にお書きください', 'textarea', null, 310)

) as v(label, field_type, options, sort_order)
where not exists (
  select 1 from public.counseling_questions q where q.label = v.label
);

-- ----------------------------------------------------------------
-- 同意書テンプレート（電子署名用）
--   統合版「施術説明書・同意書」（5施術を1枚に）。本文は migration 021 で投入。
-- ----------------------------------------------------------------

-- ████████ setup-production.sql ████████

-- ============================================================
-- setup-production.sql : 本番初期セットアップ
--   ① 店舗3件（存在しなければ作成）
--   ② オーナーアカウント marin（管理者）の auth ユーザー＋スタッフ登録
--
-- 使い方: migrations 001〜013 を実行した後、Supabase の SQL Editor で
--         このファイル全体を実行する。
--
-- ログイン情報（必要に応じて下の v_email / v_password を書き換えてから実行）:
--   メールアドレス: marin@noble.example.com
--   パスワード:     noble-marin-2026
--   ※ 運用開始後に必ず変更してください
-- ============================================================

-- ① 店舗
insert into public.stores (name, code, sort_order)
select v.name, v.code, v.sort_order
from (values
  ('新宿店',     'shinjuku',       1),
  ('新宿南口店', 'shinjuku-south', 2),
  ('恵比寿店',   'ebisu',          3)
) as v(name, code, sort_order)
where not exists (select 1 from public.stores s where s.code = v.code);

-- ② オーナーアカウント marin
do $$
declare
  v_email    text := 'marin@noble.example.com';  -- ←変更可
  v_password text := 'noble-marin-2026';         -- ←変更可
  v_user_id  uuid;
begin
  -- 既存の auth ユーザーがあれば再利用、なければ作成
  select id into v_user_id from auth.users where email = v_email;

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token,
      email_change, email_change_token_new, email_change_token_current,
      reauthentication_token, is_sso_user
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user_id,
      'authenticated', 'authenticated',
      v_email, crypt(v_password, gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(),
      '', '', '', '', '', '', false
    );

    -- メール＋パスワードでのサインインに必要な identity 行
    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_user_id, v_user_id::text, 'email',
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
      now(), now(), now()
    );
  end if;

  -- スタッフ（管理者）として登録・紐付け
  insert into public.staff (email, name, role, icon_emoji, theme_color, auth_user_id, is_active)
  values (v_email, 'marin', 'admin', '', '#B89B5E', v_user_id, true)
  on conflict (email) do update
    set auth_user_id = excluded.auth_user_id,
        role = 'admin',
        is_active = true;

  raise notice 'オーナーアカウントを作成しました: % / パスワードはこのファイル内に記載', v_email;
end $$;
