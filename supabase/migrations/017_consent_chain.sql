-- ============================================================
-- 017_consent_chain.sql : カウンセリング → 同意書署名 の連結対応
--   ・公開フロー（顧客台帳に未紐付け）でも同意書を発行・署名できるよう
--     consent_documents.customer_id を nullable にし、counseling_sheet_id を追加
--   ・希望メニューと同意書テンプレートを結びつける menu_tag を追加
--
-- ロールバック手順:
--   alter table public.consent_documents drop column if exists counseling_sheet_id;
--   alter table public.consent_templates drop column if exists menu_tag;
--   -- customer_id を NOT NULL に戻す場合（紐付け済みであること）:
--   -- alter table public.consent_documents alter column customer_id set not null;
-- ============================================================

alter table public.consent_documents alter column customer_id drop not null;

alter table public.consent_documents
  add column if not exists counseling_sheet_id bigint references public.counseling_sheets (id) on delete set null;

create index if not exists idx_consent_documents_sheet
  on public.consent_documents (counseling_sheet_id);

-- 希望メニュー → テンプレート紐付け用タグ
--   peeling_with / peeling_without / yomogi / hydra
alter table public.consent_templates
  add column if not exists menu_tag text;
