-- ============================================================
-- 014_no_default_emoji.sql : スタッフの絵文字アイコンを既定で空にする
--   （絵文字はカレンダーチップ用のオプション。必要な場合のみ
--     マスタ管理から個別に設定する）
--
-- ロールバック手順:
--   alter table public.staff alter column icon_emoji set default '🐰';
-- ============================================================

alter table public.staff alter column icon_emoji set default '';
