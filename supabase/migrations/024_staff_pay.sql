-- ============================================================
-- 024_staff_pay.sql : シフトの報酬・交通費自動計算用マスタ
--   ・時間給（スタッフごと）
--   ・交通費 往復/日（スタッフ × 店舗ごと。勤務店舗で支給額が異なるため）
--   報酬情報のため RLS は管理者専用（スタッフ本人にも非公開）
--
-- ※ 何度実行しても安全です（既にテーブルがある場合はスキップし、
--    トリガー・ポリシーだけを正しい状態に貼り直します）。
--    最後に確認結果が表で表示されます。
--
-- ロールバック手順:
--   drop table if exists public.staff_transport_costs cascade;
--   drop table if exists public.staff_pay_settings cascade;
-- ============================================================

-- ----------------------------------------------------------------
-- 時間給（スタッフごと。行がない = 未設定）
-- ----------------------------------------------------------------
create table if not exists public.staff_pay_settings (
  staff_id     bigint primary key references public.staff (id) on delete cascade,
  hourly_wage  int not null default 0 check (hourly_wage >= 0),  -- 円/時
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid default auth.uid(),
  updated_by   uuid default auth.uid()
);

drop trigger if exists trg_staff_pay_settings_audit on public.staff_pay_settings;
create trigger trg_staff_pay_settings_audit before update on public.staff_pay_settings
  for each row execute function public.set_audit_fields();

-- ----------------------------------------------------------------
-- 交通費（スタッフ × 店舗。往復/日の実費。行がない = 未設定）
--   シフト管理の自動計算では、その日の勤務店舗に対応する行を参照する
-- ----------------------------------------------------------------
create table if not exists public.staff_transport_costs (
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

drop trigger if exists trg_staff_transport_costs_audit on public.staff_transport_costs;
create trigger trg_staff_transport_costs_audit before update on public.staff_transport_costs
  for each row execute function public.set_audit_fields();

-- ----------------------------------------------------------------
-- RLS: どちらも管理者のみ（時間給・交通費は経営情報のため
--      スタッフ別実績と同様にスタッフには開放しない）
-- ----------------------------------------------------------------
alter table public.staff_pay_settings enable row level security;
drop policy if exists staff_pay_settings_admin on public.staff_pay_settings;
create policy staff_pay_settings_admin on public.staff_pay_settings for all
  using (public.is_admin()) with check (public.is_admin());

alter table public.staff_transport_costs enable row level security;
drop policy if exists staff_transport_costs_admin on public.staff_transport_costs;
create policy staff_transport_costs_admin on public.staff_transport_costs for all
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------
-- 適用結果の確認（この表が2行とも「OK」なら設定完了です）
-- ----------------------------------------------------------------
select
  t.table_name                                   as "テーブル",
  case when c.relrowsecurity then 'OK' else '未設定' end as "RLS",
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = t.table_name) as "ポリシー数",
  (select count(*) from pg_trigger g
    where g.tgrelid = c.oid and not g.tgisinternal)                as "トリガー数"
from information_schema.tables t
join pg_class c on c.relname = t.table_name and c.relnamespace = 'public'::regnamespace
where t.table_schema = 'public'
  and t.table_name in ('staff_pay_settings', 'staff_transport_costs')
order by t.table_name;
