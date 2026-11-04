-- ============================================================
-- 032_tasks.sql : 「業務」タブ（施術以外のやること）とトップページの「今日のToDo」
--   ・staff.can_view_tasks : 業務リストを閲覧できるスタッフ（管理者が1人ずつ付与・解除）
--                            管理者は常に閲覧できる
--   ・tasks                : 業務 1件 = 1行
--       list = short（日々・週単位：毎日・数日以内・今週中など）/ long（長期：商品開発・OJT など）
--       内容・期日・優先度・担当者は管理者が設定。対応状況は 未着手 → 対応中 → 完了
--   ・task_notes           : 各業務へのメモと対応履歴（誰が・いつ 対応開始／完了したか）
--   ・set_task_status()    : スタッフによる「対応開始」「完了」「戻す」（対応者と日時を記録）
--
--   今日のToDo = 期日が今日まで（期限切れを含む）の未完了の業務 ＋ 今日完了した業務
--   （未完了のものは翌日以降も表示され続ける）
--
--   閲覧できるのは「管理者」と「権限を付与されたスタッフ」だけ。
--   画面（URL 直接アクセスはサーバー側でリダイレクト）とデータ（RLS）の両方で遮断する。
--
-- ※ 何度実行しても安全です（既にある列・テーブルはスキップし、
--    関数・トリガー・ポリシーだけを正しい状態に貼り直します）。最後に確認結果が表で表示されます。
--
-- ロールバック手順:
--   drop function if exists public.set_task_status(bigint, text);
--   drop table if exists public.task_notes cascade;
--   drop table if exists public.tasks cascade;
--   drop function if exists public.can_view_tasks();
--   alter table public.staff drop column if exists can_view_tasks;
-- ============================================================

-- ----------------------------------------------------------------
-- 閲覧権限（スタッフの行は管理者しか更新できないため、本人が自分に付与することはできない）
-- ----------------------------------------------------------------
alter table public.staff
  add column if not exists can_view_tasks boolean not null default false;

create or replace function public.can_view_tasks()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.staff
    where auth_user_id = auth.uid()
      and is_active
      and (role = 'admin' or can_view_tasks)
  );
$$;

-- ----------------------------------------------------------------
-- 業務
-- ----------------------------------------------------------------
create table if not exists public.tasks (
  id            bigint generated always as identity primary key,
  list          text not null default 'short' check (list in ('short', 'long')),
  title         text not null check (length(btrim(title)) > 0),
  description   text,                                          -- 管理者からの補足（やり方・注意点など）
  due_date      date,                                          -- 期日（null = 期日なし）
  priority      text not null default 'mid' check (priority in ('high', 'mid', 'low')),
  status        text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  assignee_id   bigint references public.staff (id) on delete set null,   -- 担当者（null = 誰でも）
  store_id      bigint references public.stores (id) on delete set null,  -- null = 全店舗
  started_by    bigint references public.staff (id) on delete set null,   -- 対応を始めた人
  started_at    timestamptz,
  completed_by  bigint references public.staff (id) on delete set null,   -- 完了させた人
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  updated_by    uuid default auth.uid()
);

create index if not exists idx_tasks_status_due on public.tasks (status, due_date);
create index if not exists idx_tasks_completed_at on public.tasks (completed_at desc);

drop trigger if exists trg_tasks_audit on public.tasks;
create trigger trg_tasks_audit before update on public.tasks
  for each row execute function public.set_audit_fields();

-- ----------------------------------------------------------------
-- メモ・対応履歴（kind = memo: スタッフのメモ / status: 対応開始・完了などの記録）
-- ----------------------------------------------------------------
create table if not exists public.task_notes (
  id          bigint generated always as identity primary key,
  task_id     bigint not null references public.tasks (id) on delete cascade,
  staff_id    bigint references public.staff (id) on delete set null default public.current_staff_id(),
  kind        text not null default 'memo' check (kind in ('memo', 'status')),
  body        text not null check (length(btrim(body)) > 0),
  created_at  timestamptz not null default now()
);

create index if not exists idx_task_notes_task on public.task_notes (task_id, created_at);

-- ----------------------------------------------------------------
-- RLS
--   業務: 閲覧 = 管理者＋権限のあるスタッフ / 作成・編集・削除 = 管理者
--         （スタッフの対応開始・完了は set_task_status 関数経由）
--   メモ: 閲覧 = 同上 / 追加 = 権限のあるスタッフ本人名義のメモのみ
--         削除 = 書いた本人 or 管理者（対応履歴は管理者のみ）
-- ----------------------------------------------------------------
alter table public.tasks enable row level security;
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select
  using (public.can_view_tasks());
drop policy if exists tasks_admin_insert on public.tasks;
create policy tasks_admin_insert on public.tasks for insert
  with check (public.is_admin());
drop policy if exists tasks_admin_update on public.tasks;
create policy tasks_admin_update on public.tasks for update
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists tasks_admin_delete on public.tasks;
create policy tasks_admin_delete on public.tasks for delete
  using (public.is_admin());

alter table public.task_notes enable row level security;
drop policy if exists task_notes_select on public.task_notes;
create policy task_notes_select on public.task_notes for select
  using (public.can_view_tasks());
drop policy if exists task_notes_insert on public.task_notes;
create policy task_notes_insert on public.task_notes for insert
  with check (
    public.can_view_tasks()
    and kind = 'memo'
    and staff_id = public.current_staff_id()
  );
drop policy if exists task_notes_delete on public.task_notes;
create policy task_notes_delete on public.task_notes for delete
  using (
    public.is_admin()
    or (kind = 'memo' and staff_id = public.current_staff_id())
  );

-- ----------------------------------------------------------------
-- 対応状況の変更（権限のあるスタッフ・管理者）
--   doing: 対応開始（対応者＝自分・開始日時を記録）
--   done : 完了（完了者＝自分・完了日時を記録。開始が未記録なら同時に記録）
--   todo : 未着手に戻す（対応者・日時をクリア）
--   いずれも task_notes に履歴を残す
-- ----------------------------------------------------------------
create or replace function public.set_task_status(p_task_id bigint, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me    bigint := public.current_staff_id();
  v_prev  text;
  v_body  text;
begin
  if v_me is null or not public.can_view_tasks() then
    raise exception '業務リストの閲覧権限がありません';
  end if;
  if p_status not in ('todo', 'doing', 'done') then
    raise exception '対応状況の指定が正しくありません';
  end if;

  select status into v_prev from public.tasks where id = p_task_id for update;
  if not found then
    raise exception '業務が見つかりません';
  end if;
  if v_prev = p_status then
    return;
  end if;

  if p_status = 'doing' then
    update public.tasks
    set status = 'doing',
        started_by = v_me, started_at = now(),
        completed_by = null, completed_at = null
    where id = p_task_id;
    v_body := case when v_prev = 'done' then '完了を取り消して対応中に戻しました' else '対応開始' end;
  elsif p_status = 'done' then
    update public.tasks
    set status = 'done',
        completed_by = v_me, completed_at = now(),
        started_by = coalesce(started_by, v_me),
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

  insert into public.task_notes (task_id, staff_id, kind, body)
  values (p_task_id, v_me, 'status', v_body);
end;
$$;

-- ----------------------------------------------------------------
-- 適用結果の確認（RLS が「OK」なら設定完了。閲覧できる人を確認してください）
-- ----------------------------------------------------------------
select
  t.relname                                                     as "テーブル",
  case when t.relrowsecurity then 'OK' else '未設定' end          as "RLS",
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = t.relname)  as "ポリシー数",
  (select string_agg(s.name, '・' order by s.id) from public.staff s
    where s.is_active and (s.role = 'admin' or s.can_view_tasks)) as "閲覧できる人"
from pg_class t
where t.oid in ('public.tasks'::regclass, 'public.task_notes'::regclass)
order by t.relname;
