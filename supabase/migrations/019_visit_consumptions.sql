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
