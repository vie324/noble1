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
