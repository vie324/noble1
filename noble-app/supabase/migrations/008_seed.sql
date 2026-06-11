-- ============================================================
-- 008_seed.sql : 動作確認用シードデータ
--   店舗3（新宿店・新宿南口店・恵比寿店）／スタッフ4／顧客8／
--   回数券・本日の来店予定（今日ボード確認用）
--
-- ※ スタッフの auth ユーザー作成は scripts/create-users.mjs で行う
--   （email をキーに staff.auth_user_id が紐付く）
--
-- ロールバック手順:
--   truncate table public.ticket_usages, public.customer_tickets,
--     public.visit_photos, public.visit_body_parts, public.visit_menus,
--     public.visits, public.customer_notes, public.customer_flags,
--     public.customers, public.ticket_products, public.flag_types,
--     public.body_parts, public.menus, public.staff, public.stores
--     restart identity cascade;
-- ============================================================

-- 店舗
insert into public.stores (name, code, sort_order) values
  ('新宿店',     'shinjuku',       1),
  ('新宿南口店', 'shinjuku-south', 2),
  ('恵比寿店',   'ebisu',          3);

-- スタッフ（パスワード等は create-users.mjs 参照）
insert into public.staff (email, name, kana, role, store_id, icon_emoji, theme_color) values
  ('admin@noble.example.com',  '坂井 オーナー', 'サカイ オーナー', 'admin', 1, '🦁', '#B89B5E'),
  ('misaki@noble.example.com', '田中 美咲',     'タナカ ミサキ',   'staff', 1, '🐨', '#C98D8D'),
  ('hanako@noble.example.com', '佐藤 花子',     'サトウ ハナコ',   'staff', 2, '🐱', '#6F8F6B'),
  ('ayaka@noble.example.com',  '鈴木 彩香',     'スズキ アヤカ',   'staff', 3, '🦄', '#C2762F');

-- メニュー（既存ダッシュボードのメニューを踏襲。store_ids 空 = 全店舗）
insert into public.menus (name, price, store_ids, sort_order) values
  ('剥離ありハーブピーリング(顔)',   18000, '{}',    1),
  ('剥離なしハーブピーリング(顔)',   15000, '{}',    2),
  ('剥離なしハーブピーリング(ボディ)', 20000, '{}',  3),
  ('よもぎ蒸し',                      8000, '{2}',   4),
  ('セルフホワイトニング',            5000, '{2}',   5);

-- 施術部位
insert into public.body_parts (name, sort_order) values
  ('顔', 1), ('デコルテ', 2), ('背中上部', 3), ('背中全体', 4),
  ('腕', 5), ('脚', 6), ('お腹', 7);

-- フラグ種別
insert into public.flag_types (name, color_key, sort_order) values
  ('クレーム対応中', 'caution', 1),
  ('要注意',         'caution', 2),
  ('変更連絡あり',   'warn',    3),
  ('VIP',            'gold',    4);

-- 回数券商品
insert into public.ticket_products (name, total_count, price, valid_days, sort_order) values
  ('5回券',  5,  85000, 180, 1),
  ('10回券', 10, 160000, 365, 2);

-- 顧客
insert into public.customers (name, kana, phone, primary_store_id, line_chat_url, first_visit_on) values
  ('山田 桜',   'ヤマダ サクラ',   '090-1234-5678', 1, 'https://line.me/R/ti/p/example1', '2025-10-02'),
  ('高橋 愛',   'タカハシ アイ',   '080-9876-5432', 1, null,                               '2025-08-15'),
  ('佐藤 結衣', 'サトウ ユイ',     '090-5555-1234', 2, 'https://line.me/R/ti/p/example3', '2025-12-20'),
  ('田中 美香', 'タナカ ミカ',     '080-7777-9999', 1, null,                               '2025-11-05'),
  ('伊藤 凛',   'イトウ リン',     '070-2222-3333', 2, null,                               '2026-01-10'),
  ('渡辺 葵',   'ワタナベ アオイ', '090-4444-1111', 3, 'https://line.me/R/ti/p/example6', '2026-02-01'),
  ('小林 真央', 'コバヤシ マオ',   '080-6666-2222', 3, null,                               '2026-03-12'),
  ('加藤 詩織', 'カトウ シオリ',   '090-8888-7777', 1, null,                               '2026-04-08');

-- 顧客フラグ・申し送り
insert into public.customer_flags (customer_id, flag_type_id, note) values
  (3, 2, '前回、施術圧について強いご指摘あり。必ず弱めで開始すること'),
  (4, 3, '次回予約の時間変更希望の連絡あり（LINE参照）'),
  (1, 4, '月2回ご来店のVIP顧客');

insert into public.customer_notes (customer_id, body, pinned) values
  (3, '施術圧は必ず「弱め」からスタート。途中で確認の声かけをすること。', true),
  (1, 'ホットタオルは厚めがお好み。お茶はほうじ茶。', true),
  (4, '6月中旬に予約変更の希望あり。確定したらこのメモを解除。', false);

-- 保有回数券（期限間近・残1回のアラート確認用データを含む）
insert into public.customer_tickets
  (customer_id, product_id, store_id, purchased_at, expires_at, total_count, remaining_count, price) values
  (1, 2, 1, (now() at time zone 'Asia/Tokyo')::date - 90,  (now() at time zone 'Asia/Tokyo')::date + 275, 10, 7, 160000),
  (2, 1, 1, (now() at time zone 'Asia/Tokyo')::date - 150, (now() at time zone 'Asia/Tokyo')::date + 25,  5,  1, 85000),
  (3, 1, 2, (now() at time zone 'Asia/Tokyo')::date - 60,  (now() at time zone 'Asia/Tokyo')::date + 120, 5,  3, 85000),
  (4, 1, 1, (now() at time zone 'Asia/Tokyo')::date - 170, (now() at time zone 'Asia/Tokyo')::date + 10,  5,  4, 85000),
  (6, 2, 3, (now() at time zone 'Asia/Tokyo')::date - 30,  (now() at time zone 'Asia/Tokyo')::date + 335, 10, 9, 160000);

-- 本日の来店予定（今日ボード確認用：未記入の箱）
insert into public.visits (customer_id, store_id, staff_id, scheduled_at, status) values
  (1, 1, 2, (now() at time zone 'Asia/Tokyo')::date + time '10:00' at time zone 'Asia/Tokyo', 'scheduled'),
  (3, 2, 3, (now() at time zone 'Asia/Tokyo')::date + time '11:30' at time zone 'Asia/Tokyo', 'scheduled'),
  (4, 1, 2, (now() at time zone 'Asia/Tokyo')::date + time '14:00' at time zone 'Asia/Tokyo', 'scheduled'),
  (6, 3, 4, (now() at time zone 'Asia/Tokyo')::date + time '16:00' at time zone 'Asia/Tokyo', 'scheduled');

-- 過去の来店記録（記入済み）— 顧客タイムライン確認用
with past_visit as (
  insert into public.visits (customer_id, store_id, staff_id, scheduled_at, status, memo, important_memo, filled_at)
  values
    (1, 1, 2, (now() at time zone 'Asia/Tokyo')::date - 14 + time '10:00' at time zone 'Asia/Tokyo',
     'filled', '肌の調子が良くなってきたとお喜び。次回も同コースご希望。',
     '次回、ホームケア用の美容液サンプルをお渡しする約束', now() - interval '14 days')
  returning id
)
insert into public.visit_menus (visit_id, menu_id)
select id, 1 from past_visit;
