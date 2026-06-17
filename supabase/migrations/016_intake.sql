-- ============================================================
-- 016_intake.sql : LINEリッチメニュー等からの「受付」フロー対応
--   固定URL（/f/new）から、お客様自身が氏名・連絡先を入力して
--   カウンセリングを送信できるようにする。送信時点では顧客台帳に
--   紐付かない（customer_id = null）ため、スタッフが受信箱で確認し、
--   既存顧客への紐付け or 新規登録 を行う。
--
-- ロールバック手順:
--   drop index if exists idx_counseling_sheets_pending;
--   alter table public.counseling_sheets
--     drop column if exists applicant_name,
--     drop column if exists applicant_kana,
--     drop column if exists applicant_phone,
--     drop column if exists store_id;
--   -- customer_id を NOT NULL へ戻す場合（紐付け済みであること）:
--   -- alter table public.counseling_sheets alter column customer_id set not null;
-- ============================================================

-- 受付（未紐付け）を許可するため customer_id を nullable に
alter table public.counseling_sheets alter column customer_id drop not null;

-- お客様が入力する本人情報（紐付け前の照合用）
alter table public.counseling_sheets
  add column if not exists applicant_name  text,
  add column if not exists applicant_kana  text,
  add column if not exists applicant_phone text,
  add column if not exists store_id        bigint references public.stores (id);

-- 受信箱（未紐付けの送信済み）を高速に引くための部分インデックス
create index if not exists idx_counseling_sheets_pending
  on public.counseling_sheets (submitted_at desc)
  where customer_id is null and status = 'submitted';
