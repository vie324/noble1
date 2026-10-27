-- ============================================================
-- 029_payroll_close_invoices.sql : 月締め（ロック）と業務委託スタッフの請求書
--   ・payroll_closings      : 締めた月（行がある月 = 締め済み）
--       締め済みの月は、シフト・勤務実績を変更できない（金額を確定させるため）
--       締めの解除は管理者が「月締め・給与」画面から行う
--   ・business_settings     : 請求書の宛先・送付先、税理士・社労士の連絡先（1行だけ）
--   ・contractor_profiles   : 業務委託スタッフ本人が登録する請求者情報（住所・振込先など）
--   ・contractor_invoices   : 請求書（スタッフ × 月で1件）。金額は締め済みの勤務実績と
--       時間単価からサーバー側で計算する（本人も金額は書き換えられない）
--
-- 前提: 024_staff_pay.sql・027_staff_private.sql を実行済みであること
--
-- ※ 何度実行しても安全です（既にあるテーブルはスキップし、トリガー・ポリシー・
--    関数だけを正しい状態に貼り直します）。最後に確認結果が表で表示されます。
--
-- ロールバック手順:
--   drop function if exists public.mark_contractor_invoice_sent(bigint);
--   drop function if exists public.issue_contractor_invoice(date, text);
--   drop function if exists public.contractor_work_summary(bigint, date);
--   drop table if exists public.contractor_invoices cascade;
--   drop table if exists public.contractor_profiles cascade;
--   drop table if exists public.business_settings cascade;
--   drop trigger if exists trg_shifts_closed_month on public.shifts;
--   drop trigger if exists trg_attendance_closed_month on public.attendance_records;
--   drop function if exists public.guard_closed_month_shifts();
--   drop function if exists public.guard_closed_month_attendance();
--   drop function if exists public.is_month_closed(date);
--   drop table if exists public.payroll_closings cascade;
-- ============================================================

-- ----------------------------------------------------------------
-- 月締め
-- ----------------------------------------------------------------
create table if not exists public.payroll_closings (
  month      date primary key check (extract(day from month) = 1),  -- 例: 2026-10-01
  closed_at  timestamptz not null default now(),
  closed_by  uuid default auth.uid(),
  note       text
);

alter table public.payroll_closings enable row level security;
drop policy if exists payroll_closings_select on public.payroll_closings;
create policy payroll_closings_select on public.payroll_closings for select
  using (public.is_active_staff());
drop policy if exists payroll_closings_admin_write on public.payroll_closings;
create policy payroll_closings_admin_write on public.payroll_closings for all
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.is_month_closed(p_date date)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.payroll_closings
    where month = date_trunc('month', p_date)::date
  );
$$;

-- 締め済みの月のシフトは変更不可（本人の「確認済み」チェックだけは許可）
create or replace function public.guard_closed_month_shifts()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and (new.staff_id, new.store_id, new.date, new.start_time, new.end_time, new.status)
         is not distinct from
         (old.staff_id, old.store_id, old.date, old.start_time, old.end_time, old.status) then
    return new;
  end if;
  if (tg_op in ('UPDATE', 'DELETE') and public.is_month_closed(old.date))
     or (tg_op in ('INSERT', 'UPDATE') and public.is_month_closed(new.date)) then
    raise exception '%は月締め済みのため、シフトを変更できません（「月締め・給与」で締めを解除してから変更してください）',
      to_char(case when tg_op = 'DELETE' then old.date else new.date end, 'YYYY年FMMM月');
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_shifts_closed_month on public.shifts;
create trigger trg_shifts_closed_month before insert or update or delete on public.shifts
  for each row execute function public.guard_closed_month_shifts();

-- 締め済みの月の勤務実績は変更不可
create or replace function public.guard_closed_month_attendance()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_date date;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select date into v_date from public.shifts where id = old.shift_id;
    if v_date is not null and public.is_month_closed(v_date) then
      raise exception '%は月締め済みのため、勤務実績を変更できません（「月締め・給与」で締めを解除してから変更してください）',
        to_char(v_date, 'YYYY年FMMM月');
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select date into v_date from public.shifts where id = new.shift_id;
    if v_date is not null and public.is_month_closed(v_date) then
      raise exception '%は月締め済みのため、勤務実績を変更できません（「月締め・給与」で締めを解除してから変更してください）',
        to_char(v_date, 'YYYY年FMMM月');
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_attendance_closed_month on public.attendance_records;
create trigger trg_attendance_closed_month before insert or update or delete on public.attendance_records
  for each row execute function public.guard_closed_month_attendance();

-- ----------------------------------------------------------------
-- 事業者設定（請求書の宛先・送付先、税理士・社労士の連絡先）。常に1行
--   スタッフも閲覧可（請求書の宛先表示に使う。個人情報は含まない）
-- ----------------------------------------------------------------
create table if not exists public.business_settings (
  id                      int primary key default 1 check (id = 1),
  company_name            text,                       -- 請求書の宛先（例: 株式会社〇〇）
  invoice_to_email        text,                       -- 請求書の送付先メール
  invoice_cc_email        text,
  payment_terms           text not null default '月末締め・翌月末払い',
  payment_due_day         int check (payment_due_day is null or payment_due_day between 1 and 31),
                                                      -- 支払日（翌月の何日。空欄 = 翌月末）
  accountant_name         text,                       -- 税理士
  accountant_email        text,
  labor_consultant_name   text,                       -- 社労士
  labor_consultant_email  text,
  updated_at              timestamptz not null default now(),
  updated_by              uuid default auth.uid()
);

insert into public.business_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists trg_business_settings_audit on public.business_settings;
create trigger trg_business_settings_audit before update on public.business_settings
  for each row execute function public.set_audit_fields();

alter table public.business_settings enable row level security;
drop policy if exists business_settings_select on public.business_settings;
create policy business_settings_select on public.business_settings for select
  using (public.is_active_staff());
drop policy if exists business_settings_admin_write on public.business_settings;
create policy business_settings_admin_write on public.business_settings for all
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------
-- 請求者情報（業務委託スタッフ本人が登録。本人と管理者だけが閲覧・編集）
-- ----------------------------------------------------------------
create table if not exists public.contractor_profiles (
  staff_id             bigint primary key references public.staff (id) on delete cascade,
  issuer_name          text not null default '',   -- 請求者名（氏名・屋号）
  postal_code          text,
  address              text,
  phone                text,
  email                text,
  registration_number  text check (registration_number is null or registration_number = ''
                                   or registration_number ~ '^T[0-9]{13}$'),  -- 適格請求書発行事業者の登録番号
  bank_name            text,
  bank_branch          text,
  bank_account_type    text check (bank_account_type is null or bank_account_type in ('普通', '当座')),
  bank_account_number  text,
  bank_account_holder  text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid default auth.uid(),
  updated_by           uuid default auth.uid()
);

drop trigger if exists trg_contractor_profiles_audit on public.contractor_profiles;
create trigger trg_contractor_profiles_audit before update on public.contractor_profiles
  for each row execute function public.set_audit_fields();

alter table public.contractor_profiles enable row level security;
drop policy if exists contractor_profiles_own on public.contractor_profiles;
create policy contractor_profiles_own on public.contractor_profiles for all
  using (staff_id = public.current_staff_id() or public.is_admin())
  with check (staff_id = public.current_staff_id() or public.is_admin());

-- ----------------------------------------------------------------
-- 請求書（スタッフ × 月で1件）。作成・送信済みの記録は関数経由のみ
-- ----------------------------------------------------------------
create table if not exists public.contractor_invoices (
  id              bigint generated always as identity primary key,
  staff_id        bigint not null references public.staff (id) on delete cascade,
  month           date not null check (extract(day from month) = 1),
  invoice_number  text not null unique,
  issue_date      date not null,
  due_date        date not null,
  lines           jsonb not null default '[]',  -- 店舗別の稼働内訳 [{store_name, days, minutes, transport}]
  hourly_wage     int not null,
  work_days       int not null,
  work_minutes    int not null,
  subtotal        int not null,                 -- 報酬（税抜）
  tax             int not null,                 -- 消費税（10%）
  transport       int not null,                 -- 交通費（実費・非課税）
  total           int not null,                 -- ご請求額
  issuer          jsonb not null,               -- 作成時点の請求者情報
  recipient       jsonb not null,               -- 作成時点の宛先
  note            text,
  sent_at         timestamptz,                  -- Gmail で送信した日時（本人が記録）
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid(),
  updated_by      uuid default auth.uid(),
  unique (staff_id, month)
);

drop trigger if exists trg_contractor_invoices_audit on public.contractor_invoices;
create trigger trg_contractor_invoices_audit before update on public.contractor_invoices
  for each row execute function public.set_audit_fields();

alter table public.contractor_invoices enable row level security;
drop policy if exists contractor_invoices_select on public.contractor_invoices;
create policy contractor_invoices_select on public.contractor_invoices for select
  using (staff_id = public.current_staff_id() or public.is_admin());
drop policy if exists contractor_invoices_admin_delete on public.contractor_invoices;
create policy contractor_invoices_admin_delete on public.contractor_invoices for delete
  using (public.is_admin());

-- 指定スタッフ・指定月の稼働内訳（店舗別。確定シフトのみ、実績があれば実績時間）
--   本人と管理者だけが取得できる。シフト管理の報酬計算と同じ考え方
create or replace function public.contractor_work_summary(p_staff_id bigint, p_month date)
returns table (store_id bigint, store_name text, days int, minutes int, transport int)
language sql stable security definer set search_path = public
as $$
  select
    s.store_id,
    st.name,
    count(*)::int,
    sum(extract(epoch from (coalesce(a.actual_end, s.end_time) - coalesce(a.actual_start, s.start_time))) / 60)::int,
    (count(*) * coalesce(tc.round_trip_cost, 0))::int
  from public.shifts s
  join public.stores st on st.id = s.store_id
  left join public.attendance_records a on a.shift_id = s.id
  left join public.staff_transport_costs tc on tc.staff_id = s.staff_id and tc.store_id = s.store_id
  where s.staff_id = p_staff_id
    and s.status = 'confirmed'
    and s.date >= p_month
    and s.date < (p_month + interval '1 month')::date
    and (p_staff_id = public.current_staff_id() or public.is_admin())
  group by s.store_id, st.name, st.sort_order, tc.round_trip_cost
  order by st.sort_order, s.store_id;
$$;

-- 請求書を作成（送信前なら最新の内容で作り直す）。呼び出したスタッフ本人の分のみ
create or replace function public.issue_contractor_invoice(p_month date, p_note text default null)
returns public.contractor_invoices
language plpgsql security definer set search_path = public
as $$
declare
  v_staff     public.staff;
  v_profile   public.contractor_profiles;
  v_settings  public.business_settings;
  v_existing  public.contractor_invoices;
  v_result    public.contractor_invoices;
  v_wage      int;
  v_lines     jsonb;
  v_days      int;
  v_minutes   int;
  v_transport int;
  v_subtotal  int;
  v_tax       int;
  v_due_month date;
  v_due       date;
begin
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception '対象月が正しくありません';
  end if;

  select * into v_staff from public.staff where auth_user_id = auth.uid() and is_active;
  if not found then
    raise exception 'スタッフとして登録されていません';
  end if;
  if v_staff.employment_type <> 'contractor' then
    raise exception '請求書は業務委託のスタッフだけが作成できます';
  end if;
  if not public.is_month_closed(p_month) then
    raise exception '%はまだ月締め前です。月締めが終わると請求書を作成できます', to_char(p_month, 'YYYY年FMMM月');
  end if;

  select * into v_existing from public.contractor_invoices
  where staff_id = v_staff.id and month = p_month;
  if found and v_existing.sent_at is not null then
    raise exception 'この月の請求書は送信済みです（作り直す場合は管理者に削除を依頼してください）';
  end if;

  select * into v_profile from public.contractor_profiles where staff_id = v_staff.id;
  if not found
     or coalesce(trim(v_profile.issuer_name), '') = ''
     or coalesce(trim(v_profile.address), '') = ''
     or coalesce(trim(v_profile.bank_account_number), '') = '' then
    raise exception '先に請求者情報（氏名・住所・振込先）を登録してください';
  end if;

  select hourly_wage into v_wage from public.staff_pay_settings where staff_id = v_staff.id;
  if coalesce(v_wage, 0) <= 0 then
    raise exception '時間単価が未設定です。管理者に設定を依頼してください';
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'store_name', w.store_name, 'days', w.days, 'minutes', w.minutes, 'transport', w.transport
    ) order by w.store_id), '[]'::jsonb),
    coalesce(sum(w.days), 0),
    coalesce(sum(w.minutes), 0),
    coalesce(sum(w.transport), 0)
  into v_lines, v_days, v_minutes, v_transport
  from public.contractor_work_summary(v_staff.id, p_month) w;

  if v_days = 0 then
    raise exception '%の確定シフトがありません', to_char(p_month, 'YYYY年FMMM月');
  end if;

  -- シフト管理の報酬計算と同じ: 報酬（税抜）= 時間単価 × 稼働時間、消費税 10%、交通費は非課税
  v_subtotal := round(v_wage * v_minutes / 60.0);
  v_tax := round(v_subtotal * 0.1);

  select * into v_settings from public.business_settings where id = 1;
  v_due_month := (p_month + interval '1 month')::date;
  v_due := case
    when v_settings.payment_due_day is null
      then ((v_due_month + interval '1 month')::date - 1)
    else make_date(
      extract(year from v_due_month)::int,
      extract(month from v_due_month)::int,
      least(v_settings.payment_due_day, extract(day from ((v_due_month + interval '1 month')::date - 1))::int)
    )
  end;

  insert into public.contractor_invoices (
    staff_id, month, invoice_number, issue_date, due_date, lines,
    hourly_wage, work_days, work_minutes, subtotal, tax, transport, total,
    issuer, recipient, note
  ) values (
    v_staff.id, p_month, to_char(p_month, 'YYYYMM') || '-' || lpad(v_staff.id::text, 3, '0'),
    (now() at time zone 'Asia/Tokyo')::date, v_due, v_lines,
    v_wage, v_days, v_minutes, v_subtotal, v_tax, v_transport, v_subtotal + v_tax + v_transport,
    to_jsonb(v_profile) - 'staff_id' - 'created_at' - 'updated_at' - 'created_by' - 'updated_by',
    jsonb_build_object(
      'company_name', v_settings.company_name,
      'email', v_settings.invoice_to_email,
      'cc', v_settings.invoice_cc_email,
      'payment_terms', v_settings.payment_terms
    ),
    nullif(trim(coalesce(p_note, '')), '')
  )
  on conflict (staff_id, month) do update set
    issue_date   = excluded.issue_date,
    due_date     = excluded.due_date,
    lines        = excluded.lines,
    hourly_wage  = excluded.hourly_wage,
    work_days    = excluded.work_days,
    work_minutes = excluded.work_minutes,
    subtotal     = excluded.subtotal,
    tax          = excluded.tax,
    transport    = excluded.transport,
    total        = excluded.total,
    issuer       = excluded.issuer,
    recipient    = excluded.recipient,
    note         = excluded.note
  returning * into v_result;

  return v_result;
end;
$$;

-- Gmail で送信したことを記録（本人の請求書のみ）
create or replace function public.mark_contractor_invoice_sent(p_id bigint)
returns void
language sql security definer set search_path = public
as $$
  update public.contractor_invoices
  set sent_at = now()
  where id = p_id
    and staff_id = public.current_staff_id()
    and sent_at is null;
$$;

-- ----------------------------------------------------------------
-- 適用結果の確認（すべて「OK」なら設定完了です）
-- ----------------------------------------------------------------
select
  t.relname                                                     as "テーブル",
  case when t.relrowsecurity then 'OK' else '未設定' end         as "RLS",
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = t.relname)  as "ポリシー数"
from pg_class t
where t.relnamespace = 'public'::regnamespace
  and t.relname in ('payroll_closings', 'business_settings', 'contractor_profiles', 'contractor_invoices')
union all
select
  '月締めロック（シフト・勤務実績）',
  case when count(*) = 2 then 'OK' else '未設定' end,
  count(*)
from pg_trigger
where tgname in ('trg_shifts_closed_month', 'trg_attendance_closed_month');
