-- ============================================================
-- 033_store_accounts_tasks_by_staff.sql
--   ① 「店舗」アカウント（店舗の iPad で使う共用ログイン）
--       staff.role に 'store' を追加。所属店舗（staff.store_id）を必ず設定する
--       ・カルテ・お客様・予定・掲示板・在庫など、店舗で使う画面は今までどおり使える
--       ・マイシフト・マイ書類・請求書・経営メニューは使えない（画面側で非表示・リダイレクト）
--       ・担当者や出勤スタッフの一覧には出ない（画面側で除外）
--       ・業務の「対応開始」「完了」は、iPad で「誰が対応したか」を選んで記録する
--   ② 業務リストをスタッフも追加できるように
--       ・閲覧権限のある人は誰でも業務を追加できる
--       ・編集・削除は「追加した本人」と「管理者」
--       ・対応状況（未着手／対応中／完了）と対応者・日時は、
--         これまでどおり set_task_status 関数でしか変えられない（トリガーで保護）
--   ③ 優先度は使わない（画面から削除。列は既存データのため残す）
--
-- ※ 何度実行しても安全です（制約・関数・トリガー・ポリシーを正しい状態に貼り直します）。
--    最後に確認結果が表で表示されます。032_tasks.sql の実行後に実行してください。
--
-- ロールバック手順:
--   drop trigger if exists trg_tasks_protect_status on public.tasks;
--   drop function if exists public.protect_task_status();
--   drop function if exists public.set_task_status(bigint, text, bigint);
--   （032_tasks.sql を再実行すると、関数・ポリシーが 032 の状態に戻ります）
--   update public.staff set role = 'staff', is_active = false where role = 'store';
--   alter table public.staff drop constraint if exists staff_role_check;
--   alter table public.staff add constraint staff_role_check check (role in ('admin', 'staff'));
-- ============================================================

-- ----------------------------------------------------------------
-- ① 店舗アカウント
-- ----------------------------------------------------------------
alter table public.staff drop constraint if exists staff_role_check;
alter table public.staff
  add constraint staff_role_check check (role in ('admin', 'staff', 'store'));

-- ----------------------------------------------------------------
-- ② 業務の追加・編集・削除
-- ----------------------------------------------------------------
drop policy if exists tasks_admin_insert on public.tasks;
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert
  with check (
    public.can_view_tasks()
    and status = 'todo'
    and started_by is null and started_at is null
    and completed_by is null and completed_at is null
  );

drop policy if exists tasks_admin_update on public.tasks;
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update
  using (public.is_admin() or (public.can_view_tasks() and created_by = auth.uid()))
  with check (public.is_admin() or (public.can_view_tasks() and created_by = auth.uid()));

drop policy if exists tasks_admin_delete on public.tasks;
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete
  using (public.is_admin() or (public.can_view_tasks() and created_by = auth.uid()));

-- 対応状況・対応者・日時は set_task_status 経由でしか変えられないようにする
-- （編集フォームから「完了」や「対応者」を書き換えて記録を偽れないように）
create or replace function public.protect_task_status()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('noble.task_status_rpc', true), '') = 'on' then
    return new;
  end if;
  if new.status is distinct from old.status
     or new.started_by is distinct from old.started_by
     or new.started_at is distinct from old.started_at
     or new.completed_by is distinct from old.completed_by
     or new.completed_at is distinct from old.completed_at
     or new.created_by is distinct from old.created_by then
    raise exception '対応状況は「対応開始」「完了」のボタンから変更してください';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tasks_protect_status on public.tasks;
create trigger trg_tasks_protect_status before update on public.tasks
  for each row execute function public.protect_task_status();

-- ----------------------------------------------------------------
-- 対応状況の変更（店舗アカウントは「誰が対応したか」を指定する）
-- ----------------------------------------------------------------
drop function if exists public.set_task_status(bigint, text);

create or replace function public.set_task_status(
  p_task_id  bigint,
  p_status   text,
  p_staff_id bigint default null   -- 店舗アカウント（iPad）から記録するときの対応者
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me     bigint := public.current_staff_id();
  v_role   text;
  v_place  text;
  v_actor  bigint;
  v_prev   text;
  v_body   text;
begin
  if v_me is null or not public.can_view_tasks() then
    raise exception '業務リストの閲覧権限がありません';
  end if;
  if p_status not in ('todo', 'doing', 'done') then
    raise exception '対応状況の指定が正しくありません';
  end if;

  select role, name into v_role, v_place from public.staff where id = v_me;
  if v_role = 'store' then
    if p_staff_id is null then
      raise exception '対応したスタッフを選んでください';
    end if;
    if not exists (
      select 1 from public.staff
      where id = p_staff_id and is_active and role <> 'store'
    ) then
      raise exception '対応したスタッフが見つかりません';
    end if;
    v_actor := p_staff_id;
  else
    v_actor := v_me;  -- スタッフ・管理者は常に本人として記録
  end if;

  select status into v_prev from public.tasks where id = p_task_id for update;
  if not found then
    raise exception '業務が見つかりません';
  end if;
  if v_prev = p_status then
    return;
  end if;

  perform set_config('noble.task_status_rpc', 'on', true);
  if p_status = 'doing' then
    update public.tasks
    set status = 'doing',
        started_by = v_actor, started_at = now(),
        completed_by = null, completed_at = null
    where id = p_task_id;
    v_body := case when v_prev = 'done' then '完了を取り消して対応中に戻しました' else '対応開始' end;
  elsif p_status = 'done' then
    update public.tasks
    set status = 'done',
        completed_by = v_actor, completed_at = now(),
        started_by = coalesce(started_by, v_actor),
        started_at = coalesce(started_at, now())
    where id = p_task_id;
    v_body := '完了';
  else
    update public.tasks
    set status = 'todo',
        started_by = null, started_at = null,
        completed_by = null, completed_at = null
    where id = p_task_id;
    v_body := case when v_prev = 'done' then '完了を取り消しました' else '未着手に戻しました' end;
  end if;
  perform set_config('noble.task_status_rpc', 'off', true);

  if v_role = 'store' then
    v_body := v_body || '（' || v_place || 'から記録）';
  end if;

  insert into public.task_notes (task_id, staff_id, kind, body)
  values (p_task_id, v_actor, 'status', v_body);
end;
$$;

-- ----------------------------------------------------------------
-- 適用結果の確認（「OK」が並べば設定完了です）
-- ----------------------------------------------------------------
select
  case when pg_get_constraintdef(c.oid) like '%store%' then 'OK' else '未設定' end   as "店舗アカウント",
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'tasks'
      and p.policyname in ('tasks_insert', 'tasks_update', 'tasks_delete'))         as "業務のポリシー（3ならOK）",
  case when exists (select 1 from pg_trigger t
    where t.tgname = 'trg_tasks_protect_status') then 'OK' else '未設定' end        as "対応記録の保護",
  (select string_agg(s.name, '・' order by s.id) from public.staff s
    where s.role = 'store')                                                          as "店舗アカウント一覧"
from pg_constraint c
where c.conname = 'staff_role_check' and c.conrelid = 'public.staff'::regclass;
