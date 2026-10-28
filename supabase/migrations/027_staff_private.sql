-- ============================================================
-- 027_staff_private.sql : スタッフの個人情報（管理者＝マリンさんのみ閲覧・編集）
--   ・staff.employment_type : 雇用区分（正社員／パート・アルバイト／業務委託）
--       業務委託スタッフには「請求書」メニューが表示される（029 で使用）
--   ・staff_private         : 住所・最寄り駅・生年月日・緊急連絡先・振込先など
--       RLS は管理者のみ。スタッフ本人を含め、ほかのスタッフからは一切見えない
--       （マイナンバーは法令上の厳格な管理が必要なため、このシステムでは扱わない）
--
-- ※ 何度実行しても安全です（既にある列・テーブルはスキップし、
--    トリガー・ポリシーだけを正しい状態に貼り直します）。
--    最後に確認結果が表で表示されます。
--
-- ロールバック手順:
--   drop table if exists public.staff_private cascade;
--   alter table public.staff drop column if exists employment_type;
-- ============================================================

-- ----------------------------------------------------------------
-- 雇用区分（スタッフ一覧と同じく全スタッフが参照できる。個人情報ではない）
-- ----------------------------------------------------------------
alter table public.staff
  add column if not exists employment_type text not null default 'employee'
    check (employment_type in ('employee', 'part_time', 'contractor'));

-- ----------------------------------------------------------------
-- 個人情報（スタッフ 1人につき 1行。行がない = 未入力）
-- ----------------------------------------------------------------
create table if not exists public.staff_private (
  staff_id             bigint primary key references public.staff (id) on delete cascade,
  birth_date           date,
  postal_code          text,
  address              text,
  nearest_station      text,
  commute_route        text,            -- 通勤経路（交通費の根拠）
  personal_phone       text,
  personal_email       text,
  emergency_name       text,            -- 緊急連絡先
  emergency_relation   text,
  emergency_phone      text,
  joined_on            date,            -- 入社日・契約開始日
  bank_name            text,            -- 給与・報酬の振込先
  bank_branch          text,
  bank_account_type    text check (bank_account_type is null or bank_account_type in ('普通', '当座')),
  bank_account_number  text,
  bank_account_holder  text,            -- 口座名義（カナ）
  memo                 text,            -- 管理者メモ（資格・面談記録など）
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid default auth.uid(),
  updated_by           uuid default auth.uid()
);

drop trigger if exists trg_staff_private_audit on public.staff_private;
create trigger trg_staff_private_audit before update on public.staff_private
  for each row execute function public.set_audit_fields();

alter table public.staff_private enable row level security;
drop policy if exists staff_private_admin on public.staff_private;
create policy staff_private_admin on public.staff_private for all
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------
-- 適用結果の確認（RLS が「OK」、閲覧できる人が管理者だけなら設定完了）
-- ----------------------------------------------------------------
select
  'staff_private'                                               as "テーブル",
  case when c.relrowsecurity then 'OK' else '未設定' end         as "RLS",
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'staff_private') as "ポリシー数",
  (select string_agg(s.name, '・' order by s.id) from public.staff s
    where s.role = 'admin' and s.is_active)                     as "閲覧できる人（管理者）"
from pg_class c
where c.oid = 'public.staff_private'::regclass;
