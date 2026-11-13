-- ============================================================
-- 034_shift_submissions.sql : シフト希望の提出をスタッフのアカウントで行うための仕上げ
--   ・shift_recruitments.deadline   : 提出締切日（任意。スタッフの画面とトップのお知らせに表示）
--   ・shift_request_submissions     : スタッフ × 月 の「提出」記録と、月全体へのコメント
--       （例:「12/24 は18時まで」「月4回まで希望」）。管理者は提出状況の一覧で確認する
--   ・受付を締め切った月は、スタッフが希望・コメントを変更できないようにする
--       （管理者は締切後も代理で修正できる。受付を再開すればスタッフも再び変更できる）
--
-- ※ 何度実行しても安全です（既にある列・テーブルはスキップし、
--    関数・トリガー・ポリシーを正しい状態に貼り直します）。最後に確認結果が表で表示されます。
--
-- ロールバック手順:
--   drop table if exists public.shift_request_submissions cascade;
--   drop function if exists public.is_shift_recruitment_open(date);
--   alter table public.shift_recruitments drop column if exists deadline;
--   drop policy if exists shift_requests_select on public.shift_requests;
--   drop policy if exists shift_requests_write on public.shift_requests;
--   drop policy if exists shift_requests_update on public.shift_requests;
--   drop policy if exists shift_requests_delete on public.shift_requests;
--   create policy shift_requests_own on public.shift_requests for all
--     using (staff_id = public.current_staff_id() or public.is_admin())
--     with check (staff_id = public.current_staff_id() or public.is_admin());
-- ============================================================

-- ----------------------------------------------------------------
-- 提出締切日
-- ----------------------------------------------------------------
alter table public.shift_recruitments
  add column if not exists deadline date;

-- その月の希望を受付中か（RLS から使う）
create or replace function public.is_shift_recruitment_open(p_month date)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.shift_recruitments
    where month = p_month and status = 'open'
  );
$$;

-- ----------------------------------------------------------------
-- 提出記録・コメント（スタッフ 1人 × 月 1行）
-- ----------------------------------------------------------------
create table if not exists public.shift_request_submissions (
  id            bigint generated always as identity primary key,
  staff_id      bigint not null references public.staff (id) on delete cascade,
  month         date not null check (extract(day from month) = 1),
  comment       text,                  -- 月全体への希望・連絡（任意）
  submitted_at  timestamptz,           -- 「提出する」を押した日時（null = 入力中）
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  updated_by    uuid default auth.uid(),
  unique (staff_id, month)
);

drop trigger if exists trg_shift_request_submissions_audit on public.shift_request_submissions;
create trigger trg_shift_request_submissions_audit before update on public.shift_request_submissions
  for each row execute function public.set_audit_fields();

alter table public.shift_request_submissions enable row level security;
drop policy if exists shift_request_submissions_select on public.shift_request_submissions;
create policy shift_request_submissions_select on public.shift_request_submissions for select
  using (staff_id = public.current_staff_id() or public.is_admin());
drop policy if exists shift_request_submissions_insert on public.shift_request_submissions;
create policy shift_request_submissions_insert on public.shift_request_submissions for insert
  with check (
    public.is_admin()
    or (staff_id = public.current_staff_id() and public.is_shift_recruitment_open(month))
  );
drop policy if exists shift_request_submissions_update on public.shift_request_submissions;
create policy shift_request_submissions_update on public.shift_request_submissions for update
  using (
    public.is_admin()
    or (staff_id = public.current_staff_id() and public.is_shift_recruitment_open(month))
  )
  with check (
    public.is_admin()
    or (staff_id = public.current_staff_id() and public.is_shift_recruitment_open(month))
  );
drop policy if exists shift_request_submissions_delete on public.shift_request_submissions;
create policy shift_request_submissions_delete on public.shift_request_submissions for delete
  using (public.is_admin());

-- ----------------------------------------------------------------
-- シフト希望: 閲覧は本人と管理者。変更は「受付中の月の本人分」と管理者
-- ----------------------------------------------------------------
drop policy if exists shift_requests_own on public.shift_requests;

drop policy if exists shift_requests_select on public.shift_requests;
create policy shift_requests_select on public.shift_requests for select
  using (staff_id = public.current_staff_id() or public.is_admin());

drop policy if exists shift_requests_write on public.shift_requests;
create policy shift_requests_write on public.shift_requests for insert
  with check (
    public.is_admin()
    or (staff_id = public.current_staff_id() and public.is_shift_recruitment_open(month))
  );

drop policy if exists shift_requests_update on public.shift_requests;
create policy shift_requests_update on public.shift_requests for update
  using (
    public.is_admin()
    or (staff_id = public.current_staff_id() and public.is_shift_recruitment_open(month))
  )
  with check (
    public.is_admin()
    or (staff_id = public.current_staff_id() and public.is_shift_recruitment_open(month))
  );

drop policy if exists shift_requests_delete on public.shift_requests;
create policy shift_requests_delete on public.shift_requests for delete
  using (
    public.is_admin()
    or (staff_id = public.current_staff_id() and public.is_shift_recruitment_open(month))
  );

-- ----------------------------------------------------------------
-- 適用結果の確認（「OK」が並べば設定完了です）
-- ----------------------------------------------------------------
select
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shift_recruitments' and column_name = 'deadline'
  ) then 'OK' else '未設定' end                                       as "提出締切",
  case when c.relrowsecurity then 'OK' else '未設定' end               as "提出記録のRLS",
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'shift_requests')  as "シフト希望のポリシー（4ならOK）",
  (select string_agg(s.name || '：' || case when s.auth_user_id is null then 'ログイン未作成' else 'ログインあり' end,
                     '・' order by s.id)
     from public.staff s where s.is_active and s.role = 'staff')       as "スタッフのログイン"
from pg_class c
where c.oid = 'public.shift_request_submissions'::regclass;
