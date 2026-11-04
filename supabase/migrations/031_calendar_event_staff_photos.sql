-- ============================================================
-- 031_calendar_event_staff_photos.sql : 共有カレンダーの予定に「スタッフ」と「写真」を追加
--   ・calendar_events.staff_ids : 予定に関係するスタッフ（複数可。空 = 指定なし）
--   ・calendar_events.all_staff : 「全スタッフ」に関係する予定
--   ・calendar_event_photos     : 予定に添付した写真（登録後も予定の詳細から閲覧できる）
--   ・ストレージ event-photos（非公開・署名URLで表示）: パス = {予定ID}/{ランダム}.jpg
--   閲覧・追加 = 全スタッフ（共有カレンダーと同じ）
--   削除 = 写真を追加した本人・予定を作った本人・管理者
--
-- ※ 何度実行しても安全です（既にある列・テーブル・バケットはスキップし、
--    ポリシーだけを正しい状態に貼り直します）。最後に確認結果が表で表示されます。
--
-- ロールバック手順:
--   delete from storage.objects where bucket_id = 'event-photos';
--   delete from storage.buckets where id = 'event-photos';
--   drop table if exists public.calendar_event_photos cascade;
--   alter table public.calendar_events drop column if exists staff_ids;
--   alter table public.calendar_events drop column if exists all_staff;
-- ============================================================

-- ----------------------------------------------------------------
-- 予定に関係するスタッフ
-- ----------------------------------------------------------------
alter table public.calendar_events
  add column if not exists staff_ids bigint[] not null default '{}',
  add column if not exists all_staff boolean not null default false;

-- スタッフを選んだ予定はタイトルを省略できる（空文字を許可。表示はスタッフ名で代用）
-- ※ title は従来どおり not null（空文字は可）

-- ----------------------------------------------------------------
-- 予定の写真（予定を消すと行も消える。ファイルは画面側で先に削除）
-- ----------------------------------------------------------------
create table if not exists public.calendar_event_photos (
  id            bigint generated always as identity primary key,
  event_id      bigint not null references public.calendar_events (id) on delete cascade,
  storage_path  text not null unique,     -- event-photos バケット内のパス（{event_id}/...）
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid()
);

create index if not exists idx_calendar_event_photos_event
  on public.calendar_event_photos (event_id);

alter table public.calendar_event_photos enable row level security;
drop policy if exists calendar_event_photos_select on public.calendar_event_photos;
create policy calendar_event_photos_select on public.calendar_event_photos for select
  using (public.is_active_staff());
drop policy if exists calendar_event_photos_insert on public.calendar_event_photos;
create policy calendar_event_photos_insert on public.calendar_event_photos for insert
  with check (public.is_active_staff());
drop policy if exists calendar_event_photos_delete on public.calendar_event_photos;
create policy calendar_event_photos_delete on public.calendar_event_photos for delete
  using (
    public.is_admin()
    or created_by = auth.uid()
    or exists (
      select 1 from public.calendar_events e
      where e.id = event_id and e.created_by = auth.uid()
    )
  );

-- ----------------------------------------------------------------
-- ストレージ（非公開・署名URLで表示）
-- ----------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-photos', 'event-photos', false, 10485760,  -- 10MB（画面側で圧縮してからアップロード）
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists event_photos_storage_select on storage.objects;
create policy event_photos_storage_select on storage.objects for select
  using (bucket_id = 'event-photos' and public.is_active_staff());

drop policy if exists event_photos_storage_insert on storage.objects;
create policy event_photos_storage_insert on storage.objects for insert
  with check (bucket_id = 'event-photos' and public.is_active_staff());

-- ファイルの削除は「写真の行」を消す前に行う（行の作成者・予定の作成者・管理者）
drop policy if exists event_photos_storage_delete on storage.objects;
create policy event_photos_storage_delete on storage.objects for delete
  using (
    bucket_id = 'event-photos'
    and (
      public.is_admin()
      or exists (
        select 1 from public.calendar_event_photos p
        where p.storage_path = name and p.created_by = auth.uid()
      )
      or exists (
        select 1 from public.calendar_events e
        where e.id::text = (storage.foldername(name))[1] and e.created_by = auth.uid()
      )
    )
  );

-- ----------------------------------------------------------------
-- 適用結果の確認（すべて「OK」なら設定完了です）
-- ----------------------------------------------------------------
select
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'calendar_events' and column_name = 'staff_ids'
  ) then 'OK' else '未設定' end                                     as "予定のスタッフ欄",
  case when c.relrowsecurity then 'OK' else '未設定' end             as "写真テーブルのRLS",
  (select case when b.public then '公開（要確認）' else '非公開 OK' end
     from storage.buckets b where b.id = 'event-photos')            as "写真の置き場",
  (select count(*) from pg_policies p
    where p.schemaname = 'storage' and p.tablename = 'objects'
      and p.policyname like 'event_photos_storage_%')               as "ファイルのポリシー数"
from pg_class c
where c.oid = 'public.calendar_event_photos'::regclass;
