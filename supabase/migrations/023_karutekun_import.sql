-- ============================================================
-- 023_karutekun_import.sql : カルテくん（KaruteKun）CSV の取り込み
--
--   ① 既存テーブルに「取り込み用の項目」を追加（顧客の生年月日・住所など）
--   ② CSV をそのまま流し込む取込テーブル（import_*）を作成
--   ③ 取込テーブル → 本番テーブルへ変換する関数 public.import_karutekun()
--
--   対応 CSV（カルテくんのエクスポート形式そのまま）:
--     カルテデータ.csv                  → public.import_karte
--     来店記録データ_*.csv              → public.import_visits
--     来店記録施術・店販データ_*.csv    → public.import_visit_items
--
--   使い方は docs/DATA_IMPORT.md を参照。
--   何度実行しても重複しません（カルテ番号・来店記録番号で突き合わせ）。
--
-- ロールバック手順:
--   drop function if exists public.import_karutekun();
--   drop function if exists public.kk_ts(text);
--   drop function if exists public.kk_date3(text, text, text);
--   drop function if exists public.kk_int(text);
--   drop function if exists public.kk_norm(text);
--   drop table if exists public.import_menu_map cascade;
--   drop table if exists public.import_visit_items cascade;
--   drop table if exists public.import_visits cascade;
--   drop table if exists public.import_karte cascade;
--   drop index if exists public.uq_customers_karte_no;
--   drop index if exists public.uq_visits_karte_visit_no;
--   drop index if exists public.uq_customer_tickets_import_key;
--   drop index if exists public.uq_ticket_usages_import_key;
--   alter table public.customers
--     drop column if exists karte_no, drop column if exists gender,
--     drop column if exists birthday, drop column if exists occupation,
--     drop column if exists postal_code, drop column if exists address,
--     drop column if exists allergy_note, drop column if exists acquisition_source,
--     drop column if exists last_visit_at, drop column if exists imported_at;
--   alter table public.visits
--     drop column if exists karte_visit_no, drop column if exists nominated;
--   alter table public.customer_tickets drop column if exists import_key;
--   alter table public.ticket_usages drop column if exists import_key;
-- ============================================================

-- ================================================================
-- ① 本番テーブルの拡張（すべて追加のみ。既存の動作には影響しません）
-- ================================================================

alter table public.customers
  add column if not exists karte_no            text,        -- カルテくんのカルテ番号
  add column if not exists gender              text,        -- 女性 / 男性 / その他
  add column if not exists birthday            date,
  add column if not exists occupation          text,
  add column if not exists postal_code         text,
  add column if not exists address             text,
  add column if not exists allergy_note        text,        -- アレルギー等の注意事項
  add column if not exists acquisition_source  text,        -- 来店動機（カンマ区切り）
  add column if not exists last_visit_at       timestamptz, -- 最終来店（取り込み時点で再計算）
  add column if not exists imported_at         timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customers_gender_check'
  ) then
    alter table public.customers
      add constraint customers_gender_check
      check (gender is null or gender in ('女性', '男性', 'その他'));
  end if;
end $$;

-- カルテ番号で一意（null は複数可＝手入力の顧客は従来どおり）
create unique index if not exists uq_customers_karte_no
  on public.customers (karte_no);

alter table public.visits
  add column if not exists karte_visit_no  text,     -- カルテくんの来店記録番号
  add column if not exists nominated       boolean not null default false;  -- 指名

create unique index if not exists uq_visits_karte_visit_no
  on public.visits (karte_visit_no);

-- 回数券の再取り込みで重複しないための照合キー
alter table public.customer_tickets add column if not exists import_key text;
create unique index if not exists uq_customer_tickets_import_key
  on public.customer_tickets (import_key);

alter table public.ticket_usages add column if not exists import_key text;
create unique index if not exists uq_ticket_usages_import_key
  on public.ticket_usages (import_key);

-- ================================================================
-- ② 取込テーブル（CSV のヘッダー名・並び順そのまま。全列 text）
--    列名を CSV と完全一致させているため、Supabase の CSV インポートでも
--    psql の \copy でもそのまま流し込めます。
-- ================================================================

create table if not exists public.import_karte (
  "カルテ番号"                  text,
  "サロン名"                    text,
  "お客様名"                    text,
  "よみがな"                    text,
  "性別"                        text,
  "アレルギー等の注意事項"      text,
  "メモ"                        text,
  "生年月日(年)"                text,
  "生年月日(月)"                text,
  "生年月日(日)"                text,
  "職業"                        text,
  "電話番号"                    text,
  "メール"                      text,
  "郵便番号"                    text,
  "住所"                        text,
  "初回来店日時"                text,
  "最終来店日時"                text,
  "最終担当スタッフ"            text,
  "来店回数"                    text,
  "総支払額"                    text,
  "施術合計売上"                text,
  "店販合計売上"                text,
  "来店周期(日数)"              text,
  "顧客セグメント"              text,
  "作成日時"                    text,
  "最終更新日時"                text,
  "来店動機"                    text,
  "[グループ]初回来店日時"      text,
  "[グループ]最終来店日時"      text,
  "[グループ]最終担当スタッフ"  text,
  "[グループ]来店回数"          text,
  "[グループ]総支払額"          text,
  "[グループ]施術合計売上"      text,
  "[グループ]店販合計売上"      text,
  "[グループ]来店周期(日数)"    text,
  "[グループ]顧客セグメント"    text
);

create table if not exists public.import_visits (
  "来店記録番号"          text,
  "サロン名"              text,
  "カルテ番号"            text,
  "お客様名"              text,
  "主担当"                text,
  "開始時刻"              text,
  "終了時刻"              text,
  "指名フラグ"            text,
  "メモ"                  text,
  "訪問回数"              text,
  "作成日時"              text,
  "最終更新日時"          text,
  "施術合計売上(税込)"    text,
  "店販合計売上(税込)"    text,
  "税額"                  text,
  "税端数処理"            text,
  "会計状態"              text,
  "お釣り"                text,
  "現金"                  text,
  "クレジットカード"      text,
  "ポイント"              text,
  "その他"                text
);

create table if not exists public.import_visit_items (
  "来店記録番号"          text,
  "名前"                  text,
  "大カテゴリ"            text,
  "小カテゴリ"            text,
  "数量"                  text,
  "定価"                  text,
  "価格調整後の単価"      text,
  "割引按分後の単価"      text,
  "売上(税込)"            text,
  "税額"                  text,
  "税率"                  text,
  "内税・外税"            text,
  "調整理由"              text,
  "担当者1"               text,
  "担当者1売上"           text,
  "担当者1指名フラグ"     text,
  "担当者2"               text,
  "担当者2売上"           text,
  "担当者2指名フラグ"     text,
  "担当者3"               text,
  "担当者3売上"           text,
  "担当者3指名フラグ"     text,
  "担当者4"               text,
  "担当者4売上"           text,
  "担当者4指名フラグ"     text,
  "担当者5"               text,
  "担当者5売上"           text,
  "担当者5指名フラグ"     text
);

create index if not exists idx_import_visits_no
  on public.import_visits ("来店記録番号");
create index if not exists idx_import_visit_items_no
  on public.import_visit_items ("来店記録番号");

-- 取込テーブルにも RLS（顧客情報を含むため管理者のみ）
alter table public.import_karte       enable row level security;
alter table public.import_visits      enable row level security;
alter table public.import_visit_items enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='import_karte') then
    create policy import_karte_admin on public.import_karte for all
      using (public.is_admin()) with check (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='import_visits') then
    create policy import_visits_admin on public.import_visits for all
      using (public.is_admin()) with check (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='import_visit_items') then
    create policy import_visit_items_admin on public.import_visit_items for all
      using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

-- ----------------------------------------------------------------
-- 施術メニュー名 → メニューマスタ・部位マスタ の対応表
--   カルテくん側は「剥離ハーブピーリング（背中全体）」のように
--   メニューと部位が1つの名前になっているため、ここで2つに分解する。
--   表記ゆれ（＋/+、全角スペース、•/・）もこの表で吸収する。
--   新しいメニューが増えたら、この表に1行足せば取り込めます。
-- ----------------------------------------------------------------
create table if not exists public.import_menu_map (
  item_name       text primary key,   -- CSV の「名前」列そのまま
  menu_name       text not null,      -- public.menus.name
  body_part_name  text                -- public.body_parts.name（部位なしは null）
);

alter table public.import_menu_map enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='import_menu_map') then
    create policy import_menu_map_select on public.import_menu_map for select
      using (public.is_active_staff());
    create policy import_menu_map_admin on public.import_menu_map for all
      using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

insert into public.import_menu_map (item_name, menu_name, body_part_name) values
  ('よもぎ蒸し',                            'よもぎ蒸し',                   null),
  ('よもぎ蒸し＋ハーブピーリング',          'よもぎ蒸し+ハーブピーリング',  null),
  ('よもぎ蒸し＋毛穴洗浄',                  'よもぎ蒸し+毛穴洗浄',          null),
  ('ローズマリー蒸し',                      'ローズマリー蒸し',             null),
  ('レモングラス蒸し',                      'レモングラス蒸し',             null),
  ('シフォンピーリング',                    'シフォンピーリング',           null),
  ('シフォンピーリング(パックあり)',        'シフォンピーリング(パックあり)', null),
  ('シフォンピーリング(パックなし)',        'シフォンピーリング(パックなし)', null),
  ('ビオフィート',                          'ビオフィート',                 null),
  ('ビオフィート＋ハイドラ鼻付き',          'ビオフィート+ハイドラ鼻付き',  null),
  ('ハイドラフェイシャル顔のみ',            'ハイドラフェイシャル顔のみ',   null),
  ('ハイドラフェイシャル+美容液1種',        'ハイドラフェイシャル+美容液1種', null),
  ('ハイドラフェイシャル+ヒト幹細胞パック導入', 'ハイドラフェイシャル+ヒト幹細胞パック導入', null),
  ('ハイドラ＋ビタミンC',                   'ハイドラ+ビタミンC',           null),
  ('ハイドラ+ビタミンC',                    'ハイドラ+ビタミンC',           null),
  ('ハイドラ＋プラセンタ',                  'ハイドラ+プラセンタ',          null),
  ('ハイドラ+プラセンタ',                   'ハイドラ+プラセンタ',          null),
  ('ハイドラ＋幹細胞',                      'ハイドラ+幹細胞',              null),
  ('ハイドラ+幹細胞',                       'ハイドラ+幹細胞',              null),
  ('ハイドラ＋幹細胞パック',                'ハイドラ+幹細胞パック',        null),
  ('ハイドラ+幹細胞パック',                 'ハイドラ+幹細胞パック',        null),
  ('ハイドラ＋炭酸導入＋美容液',            'ハイドラ+炭酸導入+美容液',     null),
  ('ハイドラ+炭酸導入+美容液',              'ハイドラ+炭酸導入+美容液',     null),
  ('ハイドラ+炭酸導入導入+美容液1種',       'ハイドラ+炭酸導入+美容液',     null),
  -- 剥離ハーブピーリング（部位あり）
  ('剥離ハーブピーリング（顔）',            '剥離ハーブピーリング', '顔'),
  ('剥離ハーブピーリング（顔顎下）',        '剥離ハーブピーリング', '顔顎下'),
  ('剥離ハーブピーリング（顔首）',          '剥離ハーブピーリング', '顔首'),
  ('剥離ハーブピーリング（背中上）',        '剥離ハーブピーリング', '背中上'),
  ('剥離ハーブピーリング (背中下)',         '剥離ハーブピーリング', '背中下'),
  ('剥離ハーブピーリング（背中全体）',      '剥離ハーブピーリング', '背中全体'),
  ('剥離ハーブピーリング（二の腕）',        '剥離ハーブピーリング', '二の腕'),
  ('剥離ハーブピーリング（前腕）',          '剥離ハーブピーリング', '前腕'),
  ('剥離ハーブピーリング（デコルテ）',      '剥離ハーブピーリング', 'デコルテ'),
  ('剥離ハーブピーリング（お尻）',          '剥離ハーブピーリング', 'おしり'),
  ('剥離ハーブピーリング（お腹）',          '剥離ハーブピーリング', 'お腹'),
  ('剥離ハーブピーリング（ふともも・表）',  '剥離ハーブピーリング', '膝上表'),
  ('剥離ハーブピーリング（ふともも・裏）',  '剥離ハーブピーリング', '膝上裏'),
  ('剥離ハーブピーリング（膝下・表）',      '剥離ハーブピーリング', '膝下表'),
  ('剥離ハーブピーリング（膝下・裏）',      '剥離ハーブピーリング', '膝下裏'),
  -- リベルハーブピーリング（部位あり。旧表記ゆれを含む）
  ('リベルハーブピーリング（顔）',          'リベルハーブピーリング', '顔'),
  ('リベルハーブピーリング顔',              'リベルハーブピーリング', '顔'),
  ('リベルハーブピーリング（顔•顎下）',     'リベルハーブピーリング', '顔顎下'),
  ('リベルハーブピーリング（顔・顎下）',    'リベルハーブピーリング', '顔顎下'),
  ('リベルハーブピーリング（顔首）',        'リベルハーブピーリング', '顔首'),
  ('リベルハーブピーリング（背中上）',      'リベルハーブピーリング', '背中上'),
  ('リベルハーブピーリング背中上',          'リベルハーブピーリング', '背中上'),
  ('リベルハーブピーリング（背中下）',      'リベルハーブピーリング', '背中下'),
  ('リベルハーブピーリング（背中全体）',    'リベルハーブピーリング', '背中全体'),
  ('リベルハーブピーリング　背中全体',      'リベルハーブピーリング', '背中全体'),
  ('リベルハーブピーリング（二の腕）',      'リベルハーブピーリング', '二の腕'),
  ('リベルハーブピーリング　二の腕',        'リベルハーブピーリング', '二の腕'),
  ('リベルハーブピーリング（前腕）',        'リベルハーブピーリング', '前腕'),
  ('リベルハーブピーリング（デコルテ）',    'リベルハーブピーリング', 'デコルテ'),
  ('リベルハーブピーリング（お尻）',        'リベルハーブピーリング', 'おしり'),
  ('リベルハーブピーリング（お腹）',        'リベルハーブピーリング', 'お腹'),
  ('（リベルハーブピーリングお腹）',        'リベルハーブピーリング', 'お腹'),
  ('リベルハーブピーリング（膝下）',        'リベルハーブピーリング', '膝下表')
on conflict (item_name) do update
  set menu_name = excluded.menu_name,
      body_part_name = excluded.body_part_name;

-- ================================================================
-- ③ 変換ヘルパー（不正な値は例外にせず null を返す）
-- ================================================================

-- 「2024-08-03 17:15:32」（日本時間）→ timestamptz
create or replace function public.kk_ts(t text)
returns timestamptz
language plpgsql immutable
as $$
begin
  if coalesce(t, '') !~ '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}' then
    return null;
  end if;
  return (t::timestamp) at time zone 'Asia/Tokyo';
exception when others then
  return null;
end;
$$;

-- 年・月・日の3列 → date（2/30 のような不正日付は null）
create or replace function public.kk_date3(y text, m text, d text)
returns date
language plpgsql immutable
as $$
begin
  if y !~ '^\d{4}$' or m !~ '^\d{1,2}$' or d !~ '^\d{1,2}$' then
    return null;
  end if;
  return make_date(y::int, m::int, d::int);
exception when others then
  return null;
end;
$$;

create or replace function public.kk_int(t text)
returns int
language sql immutable
as $$
  select case when coalesce(t, '') ~ '^-?\d+$' then t::int end;
$$;

-- スタッフ名の突き合わせ用（全角/半角スペースを無視）
create or replace function public.kk_norm(t text)
returns text
language sql immutable
as $$
  select nullif(replace(replace(replace(coalesce(t, ''), '　', ''), ' ', ''), E'\t', ''), '');
$$;

-- ================================================================
-- ④ 取込テーブル → 本番テーブル への変換
--    SQL Editor（postgres）でも、管理者からの RPC でも実行できます。
-- ================================================================
create or replace function public.import_karutekun()
returns table (step text, detail text, affected bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
  v_unknown_salon text;
  v_unknown_items text;
begin
  -- ログイン中に呼ばれた場合は管理者のみ（SQL Editor では auth.uid() が null）
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'permission denied: admin only';
  end if;

  ------------------------------------------------------------------
  -- 0. 店舗の対応表（カルテくんのサロン名 → stores.code）
  ------------------------------------------------------------------
  drop table if exists _kk_store;
  drop table if exists _kk_names;
  drop table if exists _kk_staff;
  drop table if exists _kk_ticket_use;

  create temp table _kk_store on commit drop as
  select v.salon, s.id as store_id
  from (values
    ('NOBLE新宿本店',   'shinjuku'),
    ('NOBLE新宿南口店', 'shinjuku-south'),
    ('NOBLE恵比寿店',   'ebisu')
  ) as v(salon, code)
  join public.stores s on s.code = v.code;

  select string_agg(distinct k."サロン名", ', ')
    into v_unknown_salon
  from public.import_karte k
  where k."サロン名" is not null
    and not exists (select 1 from _kk_store t where t.salon = k."サロン名");

  if v_unknown_salon is not null then
    raise exception '未知のサロン名です: %  （supabase/migrations/023 の _kk_store か stores マスタを見直してください）',
      v_unknown_salon;
  end if;

  ------------------------------------------------------------------
  -- 1. スタッフ（名前が一致する既存スタッフに紐付け。無ければ退職者として作成）
  ------------------------------------------------------------------
  create temp table _kk_names on commit drop as
  select distinct public.kk_norm(nm) as norm, min(nm) as raw_name
  from (
    select "主担当" as nm from public.import_visits
    union all select "最終担当スタッフ" from public.import_karte
    union all select "担当者1" from public.import_visit_items
    union all select "担当者2" from public.import_visit_items
    union all select "担当者3" from public.import_visit_items
    union all select "担当者4" from public.import_visit_items
    union all select "担当者5" from public.import_visit_items
  ) s
  where public.kk_norm(nm) is not null
  group by public.kk_norm(nm);

  insert into public.staff (email, name, role, is_active, store_id)
  select n.norm || '@imported.noble.local', n.raw_name, 'staff', false, null
  from _kk_names n
  where not exists (
    select 1 from public.staff s where public.kk_norm(s.name) = n.norm
  )
  on conflict (email) do nothing;
  get diagnostics n = row_count;
  return query select '1. スタッフ'::text, '在籍していないスタッフを退職扱いで作成'::text, n;

  create temp table _kk_staff on commit drop as
  select nm.norm, min(s.id) as staff_id
  from _kk_names nm
  join public.staff s on public.kk_norm(s.name) = nm.norm
  group by nm.norm;

  ------------------------------------------------------------------
  -- 2. メニューマスタ（カルテくんの施術名から作成）
  ------------------------------------------------------------------
  insert into public.menus (name, price, sort_order)
  select v.name, v.price, v.ord
  from (values
    ('剥離ハーブピーリング',                        0, 10),
    ('リベルハーブピーリング',                  22000, 20),
    ('ビオフィート',                                0, 30),
    ('ビオフィート+ハイドラ鼻付き',             10800, 40),
    ('ハイドラフェイシャル顔のみ',                  0, 50),
    ('ハイドラ+ビタミンC',                          0, 60),
    ('ハイドラ+プラセンタ',                         0, 70),
    ('ハイドラ+幹細胞',                             0, 80),
    ('ハイドラ+幹細胞パック',                       0, 90),
    ('ハイドラ+炭酸導入+美容液',                    0, 100),
    ('ハイドラフェイシャル+美容液1種',              0, 110),
    ('ハイドラフェイシャル+ヒト幹細胞パック導入',   0, 120),
    ('シフォンピーリング',                          0, 130),
    ('シフォンピーリング(パックあり)',          13000, 140),
    ('シフォンピーリング(パックなし)',          11000, 150),
    ('よもぎ蒸し',                                  0, 160),
    ('よもぎ蒸し+ハーブピーリング',                 0, 170),
    ('よもぎ蒸し+毛穴洗浄',                         0, 180),
    ('ローズマリー蒸し',                            0, 190),
    ('レモングラス蒸し',                            0, 200)
  ) as v(name, price, ord)
  where not exists (select 1 from public.menus m where m.name = v.name);
  get diagnostics n = row_count;
  return query select '2. メニュー'::text, '不足していたメニューを作成'::text, n;

  -- 対応表にない施術名があれば警告（取り込みは続行し、その明細だけ落ちる）
  select string_agg(distinct i."名前", ' / ')
    into v_unknown_items
  from public.import_visit_items i
  where i."名前" !~ '回目'
    and not exists (select 1 from public.import_menu_map mm where mm.item_name = i."名前");

  if v_unknown_items is not null then
    raise warning '対応表 import_menu_map にない施術名があります（メニューは紐付きません）: %', v_unknown_items;
  end if;

  ------------------------------------------------------------------
  -- 3. 顧客
  ------------------------------------------------------------------
  insert into public.customers (
    name, kana, phone, email, primary_store_id, first_visit_on,
    karte_no, gender, birthday, occupation, postal_code, address,
    allergy_note, acquisition_source, booking_memo, imported_at
  )
  select
    btrim(k."お客様名"),
    coalesce(btrim(k."よみがな"), ''),
    coalesce(btrim(k."電話番号"), ''),
    nullif(btrim(k."メール"), ''),
    st.store_id,
    public.kk_ts(k."初回来店日時")::date,
    k."カルテ番号",
    case k."性別" when '女性' then '女性' when '男性' then '男性'
                  when '' then null when null then null else 'その他' end,
    public.kk_date3(k."生年月日(年)", k."生年月日(月)", k."生年月日(日)"),
    nullif(btrim(k."職業"), ''),
    nullif(btrim(k."郵便番号"), ''),
    nullif(btrim(k."住所"), ''),
    nullif(btrim(k."アレルギー等の注意事項"), ''),
    nullif(btrim(k."来店動機"), ''),
    nullif(btrim(k."メモ"), ''),
    now()
  from public.import_karte k
  join _kk_store st on st.salon = k."サロン名"
  where nullif(btrim(k."カルテ番号"), '') is not null
    and nullif(btrim(k."お客様名"), '') is not null
  on conflict (karte_no) do update set
    name               = excluded.name,
    kana               = excluded.kana,
    phone              = excluded.phone,
    email              = coalesce(excluded.email, public.customers.email),
    primary_store_id   = excluded.primary_store_id,
    -- least() は null を無視するため、CSV と既存のうち早い方が残る
    first_visit_on     = least(public.customers.first_visit_on, excluded.first_visit_on),
    gender             = excluded.gender,
    birthday           = excluded.birthday,
    occupation         = excluded.occupation,
    postal_code        = excluded.postal_code,
    address            = excluded.address,
    allergy_note       = excluded.allergy_note,
    acquisition_source = excluded.acquisition_source,
    booking_memo       = coalesce(public.customers.booking_memo, excluded.booking_memo),
    imported_at        = now();
  get diagnostics n = row_count;
  return query select '3. 顧客'::text, '登録・更新'::text, n;

  ------------------------------------------------------------------
  -- 4. 来店記録（カルテ）
  ------------------------------------------------------------------
  insert into public.visits (
    customer_id, store_id, staff_id, scheduled_at, status, memo,
    filled_at, karte_visit_no, nominated
  )
  select
    c.id,
    st.store_id,
    sf.staff_id,
    public.kk_ts(v."開始時刻"),
    case when public.kk_ts(v."開始時刻") <= now() then 'filled' else 'scheduled' end,
    nullif(btrim(v."メモ"), ''),
    case when public.kk_ts(v."開始時刻") <= now()
         then coalesce(public.kk_ts(v."終了時刻"), public.kk_ts(v."開始時刻")) end,
    v."来店記録番号",
    coalesce(public.kk_int(v."指名フラグ"), 0) = 1
  from public.import_visits v
  join _kk_store st on st.salon = v."サロン名"
  join public.customers c on c.karte_no = v."カルテ番号"
  left join _kk_staff sf on sf.norm = public.kk_norm(v."主担当")
  where nullif(btrim(v."来店記録番号"), '') is not null
    and public.kk_ts(v."開始時刻") is not null
  on conflict (karte_visit_no) do update set
    customer_id  = excluded.customer_id,
    store_id     = excluded.store_id,
    staff_id     = coalesce(excluded.staff_id, public.visits.staff_id),
    scheduled_at = excluded.scheduled_at,
    status       = excluded.status,
    memo         = coalesce(excluded.memo, public.visits.memo),
    filled_at    = excluded.filled_at,
    nominated    = excluded.nominated;
  get diagnostics n = row_count;
  return query select '4. 来店記録'::text, '登録・更新'::text, n;

  ------------------------------------------------------------------
  -- 5. 施術メニュー・施術部位
  ------------------------------------------------------------------
  insert into public.visit_menus (visit_id, menu_id)
  select distinct vi.id, m.id
  from public.import_visit_items i
  join public.visits vi          on vi.karte_visit_no = i."来店記録番号"
  join public.import_menu_map mm on mm.item_name      = i."名前"
  join public.menus m            on m.name            = mm.menu_name
  on conflict do nothing;
  get diagnostics n = row_count;
  return query select '5. 施術メニュー'::text, 'カルテに紐付け'::text, n;

  insert into public.visit_body_parts (visit_id, body_part_id)
  select distinct vi.id, bp.id
  from public.import_visit_items i
  join public.visits vi          on vi.karte_visit_no = i."来店記録番号"
  join public.import_menu_map mm on mm.item_name      = i."名前"
  join public.body_parts bp      on bp.name           = mm.body_part_name
  on conflict do nothing;
  get diagnostics n = row_count;
  return query select '5. 施術部位'::text, 'カルテに紐付け'::text, n;

  ------------------------------------------------------------------
  -- 6. 回数券（「回数券3回目（全5回）」の並びからコースを復元）
  --    ・1回目に戻る／回数が減る＝新しいコースの開始とみなす
  --    ・金額は CSV に無いため 0 円。判明したら回数券商品マスタで修正可
  ------------------------------------------------------------------
  create temp table _kk_ticket_use on commit drop as
  with used as (
    select
      vi.id                                                as visit_id,
      vi.customer_id,
      vi.store_id,
      vi.scheduled_at,
      (regexp_match(i."名前", '(\d+)\s*回目'))[1]::int      as nth,
      coalesce(
        (regexp_match(i."名前",       '全\s*(\d+)\s*回'))[1]::int,
        (regexp_match(i."小カテゴリ", '(\d+)\s*回コース'))[1]::int
      )                                                    as total,
      (i."名前" like '%よもぎ%' or i."小カテゴリ" like '%よもぎ%') as is_yomogi
    from public.import_visit_items i
    join public.visits vi on vi.karte_visit_no = i."来店記録番号"
    where i."名前" ~ '\d+\s*回目'
  ),
  ok as (
    select * from used where nth is not null and total between 1 and 100 and nth <= total
  ),
  marked as (
    -- 同じ来店で2回分消化することがあるため、回数（nth）まで含めて必ず一意に並べる
    select *,
      case when lag(nth) over w is null or nth <= lag(nth) over w then 1 else 0 end as is_start
    from ok
    window w as (partition by customer_id, is_yomogi, total order by scheduled_at, visit_id, nth)
  )
  select *,
    sum(is_start) over (
      partition by customer_id, is_yomogi, total
      order by scheduled_at, visit_id, nth
      rows between unbounded preceding and current row
    ) as course_no
  from marked;

  -- CSV に出てきたコース回数の回数券商品が無ければ作る
  insert into public.ticket_products (name, total_count, price, valid_days, sort_order)
  select distinct
    case when u.is_yomogi then format('よもぎ蒸し回数券%s回コース', u.total)
                          else format('%s回コース回数券', u.total) end,
    u.total, 0, 180, u.total
  from _kk_ticket_use u
  where not exists (
    select 1 from public.ticket_products p
    where p.name = case when u.is_yomogi then format('よもぎ蒸し回数券%s回コース', u.total)
                                         else format('%s回コース回数券', u.total) end
  );

  insert into public.customer_tickets (
    customer_id, product_id, store_id, purchased_at, expires_at,
    total_count, remaining_count, price, import_key
  )
  select
    u.customer_id,
    tp.id,
    min(u.store_id),
    min(u.scheduled_at at time zone 'Asia/Tokyo')::date,
    min(u.scheduled_at at time zone 'Asia/Tokyo')::date + tp.valid_days,
    u.total,
    u.total - count(*),
    0,
    format('kk:%s:%s:%s:%s', u.customer_id, u.is_yomogi, u.total, u.course_no)
  from _kk_ticket_use u
  join public.ticket_products tp
    on tp.name = case when u.is_yomogi
                      then format('よもぎ蒸し回数券%s回コース', u.total)
                      else format('%s回コース回数券', u.total) end
  group by u.customer_id, u.is_yomogi, u.total, u.course_no, tp.id, tp.valid_days
  on conflict (import_key) do update set
    total_count     = excluded.total_count,
    remaining_count = excluded.remaining_count,
    purchased_at    = excluded.purchased_at,
    expires_at      = excluded.expires_at;
  get diagnostics n = row_count;
  return query select '6. 回数券'::text, 'コースを復元'::text, n;

  insert into public.ticket_usages (customer_ticket_id, visit_id, used_at, import_key)
  select
    ct.id,
    u.visit_id,
    u.scheduled_at,
    format('kk:%s:%s:%s:%s:%s', u.customer_id, u.is_yomogi, u.total, u.course_no, u.nth)
  from _kk_ticket_use u
  join public.customer_tickets ct
    on ct.import_key = format('kk:%s:%s:%s:%s', u.customer_id, u.is_yomogi, u.total, u.course_no)
  on conflict (import_key) do update set
    visit_id = excluded.visit_id,
    used_at  = excluded.used_at;
  get diagnostics n = row_count;
  return query select '6. 回数券消化'::text, '消化履歴を登録'::text, n;

  -- CSV から作られなくなった回数券・消化履歴を掃除（再取り込みで整合を保つ）
  delete from public.ticket_usages tu
  using public.customer_tickets ct
  where tu.customer_ticket_id = ct.id
    and ct.import_key like 'kk:%'
    and tu.import_key is not null
    and not exists (
      select 1 from _kk_ticket_use u
      where tu.import_key = format('kk:%s:%s:%s:%s:%s',
              u.customer_id, u.is_yomogi, u.total, u.course_no, u.nth)
    );

  delete from public.customer_tickets ct
  where ct.import_key like 'kk:%'
    and not exists (
      select 1 from _kk_ticket_use u
      where ct.import_key = format('kk:%s:%s:%s:%s',
              u.customer_id, u.is_yomogi, u.total, u.course_no)
    );
  get diagnostics n = row_count;
  return query select '6. 回数券整理'::text, '前回取り込み分の不要な回数券を削除'::text, n;

  ------------------------------------------------------------------
  -- 7. 顧客の初回・最終来店日を実際のカルテから再計算
  --    （媒体別の月次集計より先に行う。集計の基準日になるため）
  ------------------------------------------------------------------
  update public.customers c
  set first_visit_on = least(coalesce(c.first_visit_on, agg.first_at), agg.first_at),
      last_visit_at  = agg.last_at
  from (
    select customer_id,
           min(scheduled_at at time zone 'Asia/Tokyo')::date as first_at,
           max(scheduled_at)                                 as last_at
    from public.visits
    where karte_visit_no is not null
    group by customer_id
  ) agg
  where agg.customer_id = c.id
    and (c.first_visit_on is distinct from least(coalesce(c.first_visit_on, agg.first_at), agg.first_at)
      or c.last_visit_at is distinct from agg.last_at);
  get diagnostics n = row_count;
  return query select '7. 初回/最終来店'::text, 'カルテ実データから再計算'::text, n;

  ------------------------------------------------------------------
  -- 8. 集客媒体（来店動機）と媒体別の月次新規数
  ------------------------------------------------------------------
  insert into public.media_sources (name, sort_order)
  select distinct btrim(s.src), 0
  from public.import_karte k,
       unnest(string_to_array(k."来店動機", ',')) as s(src)
  where nullif(btrim(s.src), '') is not null
    and not exists (
      select 1 from public.media_sources m where m.name = btrim(s.src)
    );
  get diagnostics n = row_count;
  return query select '8. 集客媒体'::text, 'マスタを作成'::text, n;

  insert into public.media_monthly (month, media_source_id, store_id, new_visits)
  select
    date_trunc('month', c.first_visit_on)::date,
    ms.id,
    c.primary_store_id,
    count(*)
  from public.customers c
  join public.media_sources ms
    on ms.name = any (array(select btrim(x) from unnest(string_to_array(c.acquisition_source, ',')) x))
  where c.karte_no is not null
    and c.first_visit_on is not null
    and c.primary_store_id is not null
  group by 1, 2, 3
  on conflict (month, media_source_id, store_id) do nothing;
  get diagnostics n = row_count;
  return query select '8. 媒体別新規'::text, '月次の新規数を登録（既存の入力は変更しません）'::text, n;

  return query
    select '完了'::text,
           format('顧客 %s件 / カルテ %s件 / 回数券 %s件',
             (select count(*) from public.customers where karte_no is not null),
             (select count(*) from public.visits    where karte_visit_no is not null),
             (select count(*) from public.customer_tickets where import_key like 'kk:%'))::text,
           0::bigint;
end;
$$;

comment on function public.import_karutekun() is
  'import_karte / import_visits / import_visit_items に取り込んだカルテくんCSVを本番テーブルへ変換する。何度でも実行可能。';

-- ================================================================
-- ⑤ 回数券商品マスタ（CSV に出てくるコースを用意。金額は不明のため0円）
-- ================================================================
insert into public.ticket_products (name, total_count, price, valid_days, sort_order)
select v.name, v.cnt, 0, 180, v.ord
from (values
  ('3回コース回数券',            3, 10),
  ('4回コース回数券',            4, 20),
  ('5回コース回数券',            5, 30),
  ('6回コース回数券',            6, 40),
  ('8回コース回数券',            8, 50),
  ('9回コース回数券',            9, 60),
  ('10回コース回数券',          10, 70),
  ('20回コース回数券',          20, 80),
  ('よもぎ蒸し回数券5回コース',  5, 90),
  ('よもぎ蒸し回数券10回コース',10, 100),
  ('よもぎ蒸し回数券20回コース',20, 110)
) as v(name, cnt, ord)
where not exists (select 1 from public.ticket_products p where p.name = v.name);
