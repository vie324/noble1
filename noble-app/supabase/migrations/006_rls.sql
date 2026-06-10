-- ============================================================
-- 006_rls.sql : RLS（行レベルセキュリティ）ポリシー
--
-- 方針:
--   - 全テーブルで RLS を有効化。未ログイン／staff 行のない auth ユーザーは一切不可
--   - マスタ系: 閲覧 = 全スタッフ / 変更 = 管理者のみ
--   - 顧客・カルテ・回数券: 閲覧・入力 = 全スタッフ（全店舗横断）/ 削除 = 管理者のみ
--   - 分析系（スタッフ別実績・残高サマリー）: 関数内で is_admin() を強制
--
-- ロールバック手順（ポリシーのみ外す場合）:
--   各テーブルに対して
--     alter table public.<table> disable row level security;
--   を実行（ポリシーは残るが無効化される）。完全削除は drop policy を併用。
-- ============================================================

-- ---------------- stores ----------------
alter table public.stores enable row level security;
create policy stores_select on public.stores for select
  using (public.is_active_staff());
create policy stores_admin_write on public.stores for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------- staff ----------------
alter table public.staff enable row level security;
-- 名前・絵文字などは全スタッフが参照（担当者選択に必要）
create policy staff_select on public.staff for select
  using (public.is_active_staff());
create policy staff_admin_write on public.staff for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------- マスタ系 ----------------
alter table public.menus enable row level security;
create policy menus_select on public.menus for select
  using (public.is_active_staff());
create policy menus_admin_write on public.menus for all
  using (public.is_admin()) with check (public.is_admin());

alter table public.body_parts enable row level security;
create policy body_parts_select on public.body_parts for select
  using (public.is_active_staff());
create policy body_parts_admin_write on public.body_parts for all
  using (public.is_admin()) with check (public.is_admin());

alter table public.flag_types enable row level security;
create policy flag_types_select on public.flag_types for select
  using (public.is_active_staff());
create policy flag_types_admin_write on public.flag_types for all
  using (public.is_admin()) with check (public.is_admin());

alter table public.ticket_products enable row level security;
create policy ticket_products_select on public.ticket_products for select
  using (public.is_active_staff());
create policy ticket_products_admin_write on public.ticket_products for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------- 顧客系（スタッフ全員が読み書き・削除は管理者） ----------------
alter table public.customers enable row level security;
create policy customers_select on public.customers for select
  using (public.is_active_staff());
create policy customers_insert on public.customers for insert
  with check (public.is_active_staff());
create policy customers_update on public.customers for update
  using (public.is_active_staff()) with check (public.is_active_staff());
create policy customers_admin_delete on public.customers for delete
  using (public.is_admin());

alter table public.customer_flags enable row level security;
create policy customer_flags_select on public.customer_flags for select
  using (public.is_active_staff());
create policy customer_flags_insert on public.customer_flags for insert
  with check (public.is_active_staff());
create policy customer_flags_update on public.customer_flags for update
  using (public.is_active_staff()) with check (public.is_active_staff());
create policy customer_flags_admin_delete on public.customer_flags for delete
  using (public.is_admin());

alter table public.customer_notes enable row level security;
create policy customer_notes_select on public.customer_notes for select
  using (public.is_active_staff());
create policy customer_notes_insert on public.customer_notes for insert
  with check (public.is_active_staff());
create policy customer_notes_update on public.customer_notes for update
  using (public.is_active_staff()) with check (public.is_active_staff());
create policy customer_notes_admin_delete on public.customer_notes for delete
  using (public.is_admin());

-- ---------------- 来店記録（カルテ） ----------------
alter table public.visits enable row level security;
create policy visits_select on public.visits for select
  using (public.is_active_staff());
create policy visits_insert on public.visits for insert
  with check (public.is_active_staff());
create policy visits_update on public.visits for update
  using (public.is_active_staff()) with check (public.is_active_staff());
create policy visits_delete on public.visits for delete
  using (public.is_active_staff());  -- 朝作った空の箱の削除はスタッフにも必要

alter table public.visit_menus enable row level security;
create policy visit_menus_all on public.visit_menus for all
  using (public.is_active_staff()) with check (public.is_active_staff());

alter table public.visit_body_parts enable row level security;
create policy visit_body_parts_all on public.visit_body_parts for all
  using (public.is_active_staff()) with check (public.is_active_staff());

alter table public.visit_photos enable row level security;
create policy visit_photos_all on public.visit_photos for all
  using (public.is_active_staff()) with check (public.is_active_staff());

-- ---------------- 回数券 ----------------
alter table public.customer_tickets enable row level security;
create policy customer_tickets_select on public.customer_tickets for select
  using (public.is_active_staff());
create policy customer_tickets_insert on public.customer_tickets for insert
  with check (public.is_active_staff());
-- 残回数の増減は use_ticket / cancel_ticket_usage（security definer）経由。
-- 直接 update は管理者のみ（誤入力の修正用）
create policy customer_tickets_admin_update on public.customer_tickets for update
  using (public.is_admin()) with check (public.is_admin());
create policy customer_tickets_admin_delete on public.customer_tickets for delete
  using (public.is_admin());

alter table public.ticket_usages enable row level security;
create policy ticket_usages_select on public.ticket_usages for select
  using (public.is_active_staff());
-- 作成・取消は関数経由（security definer）のため、直接の insert/update/delete は管理者のみ
create policy ticket_usages_admin_write on public.ticket_usages for all
  using (public.is_admin()) with check (public.is_admin());
