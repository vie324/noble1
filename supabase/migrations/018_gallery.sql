-- ============================================================
-- 018_gallery.sql : お客様にお見せするビフォーアフターページ
--   スタッフが選んだ写真で公開ページ（トークンURL）を作成し、
--   LINE等でお客様に共有する。公開ページは service role + 署名URLで配信。
--
-- ロールバック手順:
--   drop table if exists public.gallery_photos cascade;
--   drop table if exists public.gallery_pages cascade;
-- ============================================================

create table public.gallery_pages (
  id           bigint generated always as identity primary key,
  customer_id  bigint references public.customers (id) on delete set null,
  token        uuid not null unique default gen_random_uuid(),
  title        text not null default 'Before / After',
  message      text,                        -- お客様へのひとことメッセージ
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid default auth.uid(),
  updated_by   uuid default auth.uid()
);

create trigger trg_gallery_pages_audit before update on public.gallery_pages
  for each row execute function public.set_audit_fields();

create index idx_gallery_pages_customer on public.gallery_pages (customer_id);

-- ページに載せる写真（visit_photos の storage_path をコピー保持）
create table public.gallery_photos (
  id            bigint generated always as identity primary key,
  gallery_id    bigint not null references public.gallery_pages (id) on delete cascade,
  storage_path  text not null,             -- visit-photos バケットのパス
  kind          text not null check (kind in ('before', 'after')),
  caption       text,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid()
);

create index idx_gallery_photos_gallery on public.gallery_photos (gallery_id, sort_order);

-- RLS: 作成・編集はスタッフ。公開ページは service role 経由で読むため anon ポリシーは作らない
alter table public.gallery_pages enable row level security;
create policy gallery_pages_staff on public.gallery_pages for all
  using (public.is_active_staff()) with check (public.is_active_staff());

alter table public.gallery_photos enable row level security;
create policy gallery_photos_staff on public.gallery_photos for all
  using (public.is_active_staff()) with check (public.is_active_staff());
