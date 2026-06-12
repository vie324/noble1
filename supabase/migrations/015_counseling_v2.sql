-- ============================================================
-- 015_counseling_v2.sql : カウンセリング強化
--   ① 質問形式に「ack（注意事項の確認チェック）」を追加
--      （options 列に注意事項の本文を入れ、お客様が確認チェックを付ける）
--   ② カウンセリングシートをカルテ（visits）に紐付けられるようにする
--      （回答を見ながらそのままカルテ保存する運用のため）
--
-- ロールバック手順:
--   alter table public.counseling_sheets drop column if exists visit_id;
--   alter table public.counseling_questions drop constraint counseling_questions_field_type_check;
--   alter table public.counseling_questions add constraint counseling_questions_field_type_check
--     check (field_type in ('text', 'textarea', 'choice', 'multi', 'yes_no'));
-- ============================================================

alter table public.counseling_questions
  drop constraint counseling_questions_field_type_check;

alter table public.counseling_questions
  add constraint counseling_questions_field_type_check
  check (field_type in ('text', 'textarea', 'choice', 'multi', 'yes_no', 'ack'));

alter table public.counseling_sheets
  add column if not exists visit_id bigint references public.visits (id) on delete set null;

create index if not exists idx_counseling_sheets_visit on public.counseling_sheets (visit_id);
