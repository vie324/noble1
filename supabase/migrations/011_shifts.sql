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
