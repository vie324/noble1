-- ============================================================
-- 014_phase3_seed.sql : フェーズ3 動作確認用シードデータ
--
-- ロールバック手順:
--   truncate table public.stock_counts, public.menu_consumptions,
--     public.stock_entries, public.products,
--     public.board_attachments, public.board_posts,
--     public.consent_documents, public.consent_templates,
--     public.counseling_sheets, public.counseling_questions
--     restart identity cascade;
-- ============================================================

-- カウンセリング項目
insert into public.counseling_questions (label, field_type, options, sort_order) values
  ('本日はどのようなお悩みでご来店ですか？', 'multi',
   'ニキビ・ニキビ跡,毛穴の開き,くすみ,乾燥,たるみ,背中の肌荒れ,その他', 1),
  ('現在、通院中の疾患はありますか？', 'yes_no', null, 2),
  ('お薬を服用中の場合はお書きください', 'text', null, 3),
  ('アレルギー（お肌に合わない化粧品等）はありますか？', 'textarea', null, 4),
  ('妊娠中・授乳中ですか？', 'choice', '妊娠中,授乳中,いいえ', 5),
  ('普段のスキンケアについて教えてください', 'textarea', null, 6),
  ('当店をどこでお知りになりましたか？', 'choice',
   'ホットペッパー,Instagram,ご紹介,Google検索,その他', 7);

-- 同意書テンプレート
insert into public.consent_templates (title, body, sort_order) values
  ('ハーブピーリング施術同意書',
   E'私は、ハーブピーリング施術について以下の説明を受け、内容を理解した上で施術を受けることに同意します。\n\n1. 施術後、肌に赤み・ほてり・皮むけが生じる場合がありますが、通常数日で落ち着きます。\n2. 施術後24時間は洗顔・入浴・激しい運動をお控えください。\n3. 施術後1週間は日焼け止めを使用し、強い紫外線を避けてください。\n4. 妊娠中・授乳中、皮膚疾患の治療中の方は事前にお申し出ください。\n5. 体調や肌状態により、当日の施術をお断りする場合があります。\n6. 効果には個人差があります。\n\n上記について十分な説明を受け、同意いたします。', 1),
  ('セルフホワイトニング利用同意書',
   E'私は、セルフホワイトニングの利用にあたり以下を理解し、同意します。\n\n1. 本サービスはお客様ご自身で機器を操作するセルフサービスです。\n2. 効果には個人差があり、歯の状態によっては効果を感じにくい場合があります。\n3. 人工歯・差し歯には効果がありません。\n4. 知覚過敏等の症状が出た場合は直ちに利用を中止してください。\n\n上記に同意の上、利用いたします。', 2);

-- 掲示板
insert into public.board_posts (category, title, body, pinned) values
  ('店舗ルール', '開店・閉店チェックリスト',
   E'【開店】\n・空調 26℃ / 加湿器 ON\n・タオルウォーマー電源\n・BGM（プレイリストA）\n・レジ釣銭確認\n\n【閉店】\n・ベッドリネン交換\n・タオル洗濯\n・ゴミまとめ（収集日は予定カレンダー参照）\n・戸締まり・消灯', true),
  ('スタッフ割引価格', 'スタッフ・ご家族割引のご案内',
   E'スタッフ本人: 全メニュー 50%OFF\nご家族: 全メニュー 30%OFF\n物販: 仕入れ価格 +10%\n※ 予約はオフピーク時間帯でお願いします', true),
  ('FAQ', 'よくあるご質問（お客様対応）',
   E'Q. 生理中でも施術できますか？\nA. ボディは可能ですが、お肌が敏感になっているため事前にお伝えください。\n\nQ. 当日キャンセルの扱いは？\nA. 前日までは無料、当日は回数券1回分の消化またはキャンセル料50%です。', false),
  ('月末・締め作業手順', '月末締め作業の手順',
   E'1. 経営 > 実績入力 の当月分を確定\n2. 在庫 > 月末棚卸 を全店舗分入力\n3. 回数券残高ページのスクリーンショットを保存\n4. レジ現金実査 → 差異があればオーナーへ報告', false),
  ('ブログ・動画のネタ', '今月の投稿ネタ候補',
   E'・梅雨どきの肌荒れ対策\n・ハーブピーリングのビフォーアフター（同意取得済みのお客様のみ）\n・スタッフの愛用スキンケア紹介', false);

-- 商品・備品マスタ
insert into public.products (name, unit, category, sort_order) values
  ('ハーブパウダー', 'g',  '商品', 1),
  ('ピーリングジェル', '本', '商品', 2),
  ('鎮静パック', '枚', '商品', 3),
  ('よもぎ蒸しパック', '袋', '商品', 4),
  ('フェイスタオル', '枚', '備品', 5),
  ('ベッドシーツ', '枚', '備品', 6);

-- メニュー標準消費量（施術1回あたり）
insert into public.menu_consumptions (menu_id, product_id, amount)
select m.id, p.id, v.amount
from (values
  ('剥離ありハーブピーリング(顔)',   'ハーブパウダー',     10.0),
  ('剥離ありハーブピーリング(顔)',   '鎮静パック',          1.0),
  ('剥離なしハーブピーリング(顔)',   'ハーブパウダー',      6.0),
  ('剥離なしハーブピーリング(顔)',   'ピーリングジェル',    0.2),
  ('剥離なしハーブピーリング(ボディ)', 'ハーブパウダー',    15.0),
  ('よもぎ蒸し',                    'よもぎ蒸しパック',    1.0)
) as v(menu_name, product_name, amount)
join public.menus m on m.name = v.menu_name
join public.products p on p.name = v.product_name;

-- 入庫サンプル（今月・各店舗）
insert into public.stock_entries (product_id, store_id, date, quantity, note)
select p.id, s.id,
       date_trunc('month', (now() at time zone 'Asia/Tokyo')::date)::date + 2,
       case p.name
         when 'ハーブパウダー' then 500 when 'ピーリングジェル' then 10
         when '鎮静パック' then 50 when 'よもぎ蒸しパック' then 30
         when 'フェイスタオル' then 40 else 10 end,
       '月初定期発注'
from public.products p
cross join public.stores s;
