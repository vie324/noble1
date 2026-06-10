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
