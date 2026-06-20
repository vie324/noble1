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
