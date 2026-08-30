-- =============================================================
-- 業務ロジック RPC
--  - 空のカルテ(箱)作成
--  - 回数券の安全な消化(残回数チェック付き)
--  - 未記入カルテの自動マーキング
-- =============================================================

-- 来店前に「空のカルテの箱」を作成する
create or replace function create_empty_visit(
  p_customer_id uuid,
  p_store_id    uuid,
  p_staff_id    uuid default null,
  p_start_at    timestamptz default null
) returns uuid as $$
declare v_id uuid;
begin
  insert into visits (customer_id, store_id, staff_id, start_at, status)
  values (p_customer_id, p_store_id, p_staff_id, p_start_at, '予定')
  returning id into v_id;
  return v_id;
end;
$$ language plpgsql security definer;

-- 回数券を1回分消化する(残回数を集計でチェックし、なければエラー)
create or replace function consume_ticket(
  p_customer_ticket_id uuid,
  p_visit_id           uuid,
  p_used_count         int default 1
) returns void as $$
declare v_remaining int;
begin
  select total_count - coalesce(sum(tu.used_count),0)
    into v_remaining
  from customer_tickets ct
  left join ticket_usages tu on tu.customer_ticket_id = ct.id
  where ct.id = p_customer_ticket_id
  group by ct.total_count;

  if v_remaining is null then
    raise exception '回数券が見つかりません';
  end if;
  if v_remaining < p_used_count then
    raise exception '残回数が不足しています (残: %)', v_remaining;
  end if;

  insert into ticket_usages (customer_ticket_id, visit_id, used_count)
  values (p_customer_ticket_id, p_visit_id, p_used_count);
end;
$$ language plpgsql security definer;

-- 予定時刻を過ぎても中身が空のカルテを「未記入」にマーキング
-- (Cron / Edge Function から定期実行する想定)
create or replace function mark_unfilled_visits() returns int as $$
declare n int;
begin
  update visits v
  set status = '未記入'
  where v.status = '予定'
    and v.start_at is not null
    and v.start_at < now()
    and not exists (select 1 from visit_items vi where vi.visit_id = v.id)
    and coalesce(v.note,'') = '';
  get diagnostics n = row_count;
  return n;
end;
$$ language plpgsql security definer;
