-- ============================================================
-- 030_line_messaging.sql : お客様へのLINE送信を楽にする（定型文・画像・送信履歴）
--   ・line_templates     : 定型文。{お客様名} などの差し込み項目つき（管理者が編集）
--   ・line_media         : 送信用の画像ライブラリ（アフターケア案内・キャンペーン画像など）
--       ストレージ line-media は「公開」バケット。LINE のサーバーが画像を取得するため。
--       お客様の個人情報（施術写真など）は置かないこと（施術写真は非公開の visit-photos から送る）
--   ・line_message_logs  : 送信履歴（誰が・いつ・どのお客様に送ったか）。顧客ページに表示
--
-- ※ 何度実行しても安全です（既にあるテーブル・バケットはスキップし、
--    ポリシーだけを正しい状態に貼り直します。定型文の初期データは空のときだけ登録）。
--    最後に確認結果が表で表示されます。
--
-- ロールバック手順:
--   drop table if exists public.line_message_logs cascade;
--   drop table if exists public.line_media cascade;
--   drop table if exists public.line_templates cascade;
--   delete from storage.objects where bucket_id = 'line-media';
--   delete from storage.buckets where id = 'line-media';
-- ============================================================

-- ----------------------------------------------------------------
-- 定型文
-- ----------------------------------------------------------------
create table if not exists public.line_templates (
  id          bigint generated always as identity primary key,
  title       text not null,
  category    text not null default 'その他' check (category in
    ('お礼', 'ご予約', 'リマインド', 'アフターケア', 'キャンペーン', 'その他')),
  body        text not null,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_by  uuid default auth.uid()
);

drop trigger if exists trg_line_templates_audit on public.line_templates;
create trigger trg_line_templates_audit before update on public.line_templates
  for each row execute function public.set_audit_fields();

alter table public.line_templates enable row level security;
drop policy if exists line_templates_select on public.line_templates;
create policy line_templates_select on public.line_templates for select
  using (public.is_active_staff());
drop policy if exists line_templates_admin_write on public.line_templates;
create policy line_templates_admin_write on public.line_templates for all
  using (public.is_admin()) with check (public.is_admin());

-- 初期データ（定型文が1件もないときだけ）。内容は「マスタ管理 > LINE定型文」で編集できます
insert into public.line_templates (title, category, body, sort_order)
select v.title, v.category, v.body, v.sort_order
from (values
  ('ご来店のお礼', 'お礼',
   E'{お客様名}様\n本日は{店舗名}にご来店いただき、誠にありがとうございました。\nお肌の調子で気になることがございましたら、いつでもこちらのLINEにご連絡ください。\n{担当スタッフ}', 10),
  ('次回ご予約の確認', 'ご予約',
   E'{お客様名}様\n次回のご予約は {次回予約} です。\nご来店を心よりお待ちしております。\n{店舗名}', 20),
  ('前日のリマインド', 'リマインド',
   E'{お客様名}様\n明日 {次回予約} にご予約をいただいております。\nご都合が悪くなった場合は、このLINEにご返信ください。\nお気をつけてお越しくださいませ。\n{店舗名}', 30),
  ('ピーリング後のアフターケア', 'アフターケア',
   E'{お客様名}様\n本日のピーリングの後は、次の点にご注意ください。\n・当日は洗顔・メイクを控えてください\n・1週間は日焼け止めを必ずお使いください\n・皮むけは無理にはがさないでください\n気になる症状があれば、お気軽にご相談ください。\n{担当スタッフ}', 40),
  ('しばらくご来店がない方へ', 'キャンペーン',
   E'{お客様名}様\nその後お肌の調子はいかがでしょうか。\n前回のご来店（{前回来店日}）から少し期間が空きましたので、ご案内させていただきました。\nご予約はこのLINEからも承ります。\n{店舗名}', 50)
) as v(title, category, body, sort_order)
where not exists (select 1 from public.line_templates);

-- ----------------------------------------------------------------
-- 画像ライブラリ
-- ----------------------------------------------------------------
create table if not exists public.line_media (
  id            bigint generated always as identity primary key,
  title         text not null,
  storage_path  text not null unique,     -- line-media バケット内のパス
  sort_order    int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  updated_by    uuid default auth.uid()
);

drop trigger if exists trg_line_media_audit on public.line_media;
create trigger trg_line_media_audit before update on public.line_media
  for each row execute function public.set_audit_fields();

alter table public.line_media enable row level security;
drop policy if exists line_media_select on public.line_media;
create policy line_media_select on public.line_media for select
  using (public.is_active_staff());
drop policy if exists line_media_admin_write on public.line_media;
create policy line_media_admin_write on public.line_media for all
  using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('line-media', 'line-media', true, 10485760, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

drop policy if exists line_media_storage_select on storage.objects;
create policy line_media_storage_select on storage.objects for select
  using (bucket_id = 'line-media' and public.is_active_staff());
drop policy if exists line_media_storage_insert on storage.objects;
create policy line_media_storage_insert on storage.objects for insert
  with check (bucket_id = 'line-media' and public.is_admin());
drop policy if exists line_media_storage_delete on storage.objects;
create policy line_media_storage_delete on storage.objects for delete
  using (bucket_id = 'line-media' and public.is_admin());

-- ----------------------------------------------------------------
-- 送信履歴（書き込みはサーバーの送信処理のみ。スタッフは閲覧のみ）
-- ----------------------------------------------------------------
create table if not exists public.line_message_logs (
  id              bigint generated always as identity primary key,
  customer_id     bigint references public.customers (id) on delete set null,
  line_friend_id  bigint references public.line_friends (id) on delete set null,
  store_id        bigint references public.stores (id) on delete set null,
  sent_by         bigint references public.staff (id) on delete set null,
  template_id     bigint references public.line_templates (id) on delete set null,
  kind            text not null default 'message',   -- message / counseling / gallery
  body            text,
  image_count     int not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_line_message_logs_customer on public.line_message_logs (customer_id, created_at desc);

alter table public.line_message_logs enable row level security;
drop policy if exists line_message_logs_select on public.line_message_logs;
create policy line_message_logs_select on public.line_message_logs for select
  using (public.is_active_staff());

-- ----------------------------------------------------------------
-- 適用結果の確認
-- ----------------------------------------------------------------
select
  t.relname                                                     as "テーブル",
  case when t.relrowsecurity then 'OK' else '未設定' end         as "RLS",
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = t.relname)  as "ポリシー数",
  case t.relname
    when 'line_templates' then (select count(*) from public.line_templates)::text || '件'
    when 'line_media' then (select count(*) from public.line_media)::text || '件'
    else ''
  end                                                           as "登録数"
from pg_class t
where t.relnamespace = 'public'::regnamespace
  and t.relname in ('line_templates', 'line_media', 'line_message_logs')
order by t.relname;
