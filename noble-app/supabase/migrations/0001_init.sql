-- =============================================================
-- ノーブル業務システム  中核スキーマ（Phase 0〜2）
-- 顧客 / 来店記録(カルテ) / 回数券(台帳方式)
-- 対象: Supabase (PostgreSQL) / Tokyo region
-- =============================================================

-- ---------- 列挙型 ----------
create type staff_role   as enum ('admin', 'manager', 'staff');
create type visit_status as enum ('予定', '未記入', '記入済');
create type photo_kind   as enum ('before', 'after');
create type ticket_status as enum ('active', 'expired', 'refunded');

-- =============================================================
-- 店舗
-- =============================================================
create table stores (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- =============================================================
-- スタッフ (auth.users と 1:1。サインアップ時に作成)
-- =============================================================
create table staff (
  id                uuid primary key references auth.users(id) on delete cascade,
  full_name         text not null,
  role              staff_role not null default 'staff',
  primary_store_id  uuid references stores(id),
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

-- =============================================================
-- 顧客 ★全モジュールの中心
-- =============================================================
create table customers (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid references stores(id),
  name             text not null,
  name_kana        text,
  phone            text,
  email            text,
  birthday         date,
  line_user_id     text,                 -- LINEチャット導線
  salonboard_memo  text,                 -- サロンボード予約メモ相当(手入力)
  first_visit_date date,                 -- 新規→再来分析用
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_customers_store on customers(store_id);
create index idx_customers_name_kana on customers(name_kana);

-- =============================================================
-- 来店記録 = カルテ ★KaruteKun代替の核
-- =============================================================
create table visits (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references customers(id) on delete cascade,
  store_id       uuid not null references stores(id),
  staff_id       uuid references staff(id),
  visit_date     date not null default current_date,
  start_at       timestamptz,            -- 予定/開始時刻
  status         visit_status not null default '予定',
  note           text,                   -- 自由記述
  important_note text,                   -- 重要事項(強調表示)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_visits_date_store on visits(visit_date, store_id);
create index idx_visits_customer on visits(customer_id);
create index idx_visits_status on visits(status);

-- =============================================================
-- 施術明細 (メニュー・部位) ★部位別分析の源泉
-- =============================================================
create table menus (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  store_id  uuid references stores(id),   -- null = 全店共通
  price     numeric(10,0),
  is_active boolean not null default true
);

create table visit_items (
  id            uuid primary key default gen_random_uuid(),
  visit_id      uuid not null references visits(id) on delete cascade,
  menu_id       uuid references menus(id),
  body_part     text,                     -- 顔/背中上/背中全体 など
  quantity      int not null default 1,
  price         numeric(10,0),            -- 都度払い時の金額
  paid_by_ticket boolean not null default false
);
create index idx_visit_items_visit on visit_items(visit_id);
create index idx_visit_items_part on visit_items(body_part);

-- =============================================================
-- 施術前後写真 (Storage 参照)
-- =============================================================
create table visit_photos (
  id           uuid primary key default gen_random_uuid(),
  visit_id     uuid not null references visits(id) on delete cascade,
  kind         photo_kind not null,
  storage_path text not null,
  created_at   timestamptz not null default now()
);

-- =============================================================
-- 回数券 (台帳方式)
-- =============================================================
create table ticket_plans (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  total_count int not null,
  price       numeric(10,0) not null,
  valid_days  int not null default 180,
  is_active   boolean not null default true
);

create table customer_tickets (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references customers(id) on delete cascade,
  ticket_plan_id   uuid references ticket_plans(id),
  purchased_at     date not null default current_date,
  expires_at       date not null,
  total_count      int not null,          -- 購入時点の総回数(マスタからコピー)
  unit_price       numeric(10,2) not null,-- 1回単価 = price / total_count (返金計算用)
  sold_by_staff_id uuid references staff(id),
  status           ticket_status not null default 'active',
  created_at       timestamptz not null default now()
);
create index idx_ct_customer on customer_tickets(customer_id);

-- 回数券消化台帳 ★append-only。残回数はここから集計で導出
create table ticket_usages (
  id                 uuid primary key default gen_random_uuid(),
  customer_ticket_id uuid not null references customer_tickets(id) on delete cascade,
  visit_id           uuid references visits(id) on delete set null,
  used_count         int not null default 1,   -- 取消はマイナス行で表現
  used_at            timestamptz not null default now()
);
create index idx_tu_ticket on ticket_usages(customer_ticket_id);

-- =============================================================
-- ビュー: 回数券残高 (未消化回数・未消化金額・期限間近)
-- =============================================================
create view v_ticket_balance as
select
  ct.id                as customer_ticket_id,
  ct.customer_id,
  ct.ticket_plan_id,
  ct.total_count,
  coalesce(sum(tu.used_count), 0)                        as used_count,
  ct.total_count - coalesce(sum(tu.used_count), 0)       as remaining_count,
  (ct.total_count - coalesce(sum(tu.used_count), 0)) * ct.unit_price as remaining_amount,
  ct.expires_at,
  (ct.expires_at <= current_date + 30)                   as expiring_soon,
  ct.status
from customer_tickets ct
left join ticket_usages tu on tu.customer_ticket_id = ct.id
group by ct.id;

-- ビュー: 今日の来店一覧 (未記入の検知に使用)
create view v_today_visits as
select v.*, c.name as customer_name, c.name_kana, s.name as store_name
from visits v
join customers c on c.id = v.customer_id
join stores s on s.id = v.store_id
where v.visit_date = current_date;

-- ビュー: 施術部位ごとの月次回数
create view v_body_part_monthly as
select
  date_trunc('month', v.visit_date)::date as month,
  v.store_id,
  vi.body_part,
  sum(vi.quantity) as total_count
from visit_items vi
join visits v on v.id = vi.visit_id
group by 1, 2, 3;

-- =============================================================
-- updated_at 自動更新
-- =============================================================
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger trg_customers_updated before update on customers
  for each row execute function set_updated_at();
create trigger trg_visits_updated before update on visits
  for each row execute function set_updated_at();

-- =============================================================
-- 権限ヘルパ
-- =============================================================
create or replace function current_role_is(p_role staff_role) returns boolean as $$
  select exists (select 1 from staff where id = auth.uid() and role = p_role);
$$ language sql stable security definer;

create or replace function is_admin_or_manager() returns boolean as $$
  select exists (select 1 from staff where id = auth.uid() and role in ('admin','manager'));
$$ language sql stable security definer;

-- =============================================================
-- Row Level Security
-- ※ Phase 0 の基本ポリシー。役割別の細分化は各フェーズで強化。
-- =============================================================
alter table stores            enable row level security;
alter table staff             enable row level security;
alter table customers         enable row level security;
alter table visits            enable row level security;
alter table menus             enable row level security;
alter table visit_items       enable row level security;
alter table visit_photos      enable row level security;
alter table ticket_plans      enable row level security;
alter table customer_tickets  enable row level security;
alter table ticket_usages     enable row level security;

-- 認証済みスタッフは業務データを閲覧可
create policy "auth read stores"      on stores      for select to authenticated using (true);
create policy "auth read menus"       on menus       for select to authenticated using (true);
create policy "auth read plans"       on ticket_plans for select to authenticated using (true);
create policy "auth read customers"   on customers   for select to authenticated using (true);
create policy "auth read visits"      on visits      for select to authenticated using (true);
create policy "auth read visit_items" on visit_items for select to authenticated using (true);
create policy "auth read photos"      on visit_photos for select to authenticated using (true);
create policy "auth read ctickets"    on customer_tickets for select to authenticated using (true);
create policy "auth read usages"      on ticket_usages for select to authenticated using (true);

-- 自分のプロフィールは本人、一覧は管理者
create policy "staff self read"   on staff for select to authenticated using (id = auth.uid() or is_admin_or_manager());
create policy "staff self update" on staff for update to authenticated using (id = auth.uid());

-- カルテ系の入力は認証済みスタッフが可能
create policy "auth write visits"      on visits      for all to authenticated using (true) with check (true);
create policy "auth write visit_items" on visit_items for all to authenticated using (true) with check (true);
create policy "auth write photos"      on visit_photos for all to authenticated using (true) with check (true);
create policy "auth write customers"   on customers   for all to authenticated using (true) with check (true);
create policy "auth write usages"      on ticket_usages for all to authenticated using (true) with check (true);

-- 回数券マスタ/保有/メニュー/店舗の編集は管理者・店長のみ
create policy "mgr write plans"    on ticket_plans     for all to authenticated using (is_admin_or_manager()) with check (is_admin_or_manager());
create policy "mgr write ctickets" on customer_tickets for all to authenticated using (is_admin_or_manager()) with check (is_admin_or_manager());
create policy "mgr write menus"    on menus            for all to authenticated using (is_admin_or_manager()) with check (is_admin_or_manager());
create policy "mgr write stores"   on stores           for all to authenticated using (current_role_is('admin')) with check (current_role_is('admin'));
