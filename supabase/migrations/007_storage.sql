-- ============================================================
-- 007_storage.sql : 施術写真用ストレージバケット（非公開・署名URLで表示）
--
-- ロールバック手順:
--   delete from storage.objects where bucket_id = 'visit-photos';
--   delete from storage.buckets where id = 'visit-photos';
--   drop policy if exists visit_photos_storage_select on storage.objects;
--   drop policy if exists visit_photos_storage_insert on storage.objects;
--   drop policy if exists visit_photos_storage_delete on storage.objects;
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'visit-photos',
  'visit-photos',
  false,                          -- 非公開（顧客の肌写真のため）
  10485760,                       -- 10MB（クライアント側で圧縮してからアップロード）
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy visit_photos_storage_select on storage.objects for select
  using (bucket_id = 'visit-photos' and public.is_active_staff());

create policy visit_photos_storage_insert on storage.objects for insert
  with check (bucket_id = 'visit-photos' and public.is_active_staff());

create policy visit_photos_storage_delete on storage.objects for delete
  using (bucket_id = 'visit-photos' and public.is_active_staff());
