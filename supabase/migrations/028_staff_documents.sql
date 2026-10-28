-- ============================================================
-- 028_staff_documents.sql : スタッフ向け書類（給与明細・源泉徴収票など）の配布
--   ・staff_documents : 書類 1件 = 1行（スタッフ × ファイル）。管理者がアップロード
--   ・ストレージ staff-docs（非公開）: パスの先頭フォルダ = スタッフID
--   閲覧できるのは「本人」と「管理者」だけ（テーブル・ファイルの両方で RLS）
--
-- ※ 何度実行しても安全です（既にあるテーブル・バケットはスキップし、
--    ポリシー・関数だけを正しい状態に貼り直します）。
--    最後に確認結果が表で表示されます。
--
-- ロールバック手順:
--   delete from storage.objects where bucket_id = 'staff-docs';
--   delete from storage.buckets where id = 'staff-docs';
--   drop function if exists public.mark_staff_document_viewed(bigint);
--   drop table if exists public.staff_documents cascade;
-- ============================================================

create table if not exists public.staff_documents (
  id            bigint generated always as identity primary key,
  staff_id      bigint not null references public.staff (id) on delete cascade,
  category      text not null default '給与明細' check (category in
    ('給与明細', '源泉徴収票', '支払調書', '契約書・雇用条件', 'その他')),
  title         text not null,
  month         date check (month is null or extract(day from month) = 1),  -- 対象月（任意）
  storage_path  text not null unique,     -- staff-docs バケット内のパス（{staff_id}/...）
  file_name     text not null,            -- ダウンロード時のファイル名
  mime_type     text,
  size_bytes    bigint,
  note          text,
  viewed_at     timestamptz,              -- 本人が初めて開いた日時（既読）
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  updated_by    uuid default auth.uid()
);

create index if not exists idx_staff_documents_staff on public.staff_documents (staff_id, created_at desc);

drop trigger if exists trg_staff_documents_audit on public.staff_documents;
create trigger trg_staff_documents_audit before update on public.staff_documents
  for each row execute function public.set_audit_fields();

alter table public.staff_documents enable row level security;
drop policy if exists staff_documents_select on public.staff_documents;
create policy staff_documents_select on public.staff_documents for select
  using (staff_id = public.current_staff_id() or public.is_admin());
drop policy if exists staff_documents_admin_write on public.staff_documents;
create policy staff_documents_admin_write on public.staff_documents for all
  using (public.is_admin()) with check (public.is_admin());

-- 本人が開いたら既読にする（本人の書類のみ。管理者が開いても既読にはしない）
create or replace function public.mark_staff_document_viewed(p_id bigint)
returns void
language sql security definer set search_path = public
as $$
  update public.staff_documents
  set viewed_at = now()
  where id = p_id
    and staff_id = public.current_staff_id()
    and viewed_at is null;
$$;

-- ----------------------------------------------------------------
-- ストレージ（非公開・署名URLで配信）。パス = {staff_id}/{ランダム}.{拡張子}
-- ----------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'staff-docs', 'staff-docs', false, 20971520,  -- 20MB
  array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

drop policy if exists staff_docs_storage_select on storage.objects;
create policy staff_docs_storage_select on storage.objects for select
  using (
    bucket_id = 'staff-docs'
    and (public.is_admin() or (storage.foldername(name))[1] = public.current_staff_id()::text)
  );
drop policy if exists staff_docs_storage_insert on storage.objects;
create policy staff_docs_storage_insert on storage.objects for insert
  with check (bucket_id = 'staff-docs' and public.is_admin());
drop policy if exists staff_docs_storage_delete on storage.objects;
create policy staff_docs_storage_delete on storage.objects for delete
  using (bucket_id = 'staff-docs' and public.is_admin());

-- ----------------------------------------------------------------
-- 適用結果の確認
-- ----------------------------------------------------------------
select
  'staff_documents'                                              as "テーブル",
  case when c.relrowsecurity then 'OK' else '未設定' end          as "RLS",
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'staff_documents') as "ポリシー数",
  (select case when b.public then '公開（要確認）' else '非公開 OK' end
     from storage.buckets b where b.id = 'staff-docs')            as "ファイル置き場",
  (select count(*) from pg_policies p
    where p.schemaname = 'storage' and p.tablename = 'objects'
      and p.policyname like 'staff_docs_storage_%')               as "ファイルのポリシー数"
from pg_class c
where c.oid = 'public.staff_documents'::regclass;
