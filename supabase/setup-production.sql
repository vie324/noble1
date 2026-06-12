-- ============================================================
-- setup-production.sql : 本番初期セットアップ
--   ① 店舗3件（存在しなければ作成）
--   ② オーナーアカウント marin（管理者）の auth ユーザー＋スタッフ登録
--
-- 使い方: migrations 001〜013 を実行した後、Supabase の SQL Editor で
--         このファイル全体を実行する。
--
-- ログイン情報（必要に応じて下の v_email / v_password を書き換えてから実行）:
--   メールアドレス: marin@noble.example.com
--   パスワード:     noble-marin-2026
--   ※ 運用開始後に必ず変更してください
-- ============================================================

-- ① 店舗
insert into public.stores (name, code, sort_order)
select v.name, v.code, v.sort_order
from (values
  ('新宿店',     'shinjuku',       1),
  ('新宿南口店', 'shinjuku-south', 2),
  ('恵比寿店',   'ebisu',          3)
) as v(name, code, sort_order)
where not exists (select 1 from public.stores s where s.code = v.code);

-- ② オーナーアカウント marin
do $$
declare
  v_email    text := 'marin@noble.example.com';  -- ←変更可
  v_password text := 'noble-marin-2026';         -- ←変更可
  v_user_id  uuid;
begin
  -- 既存の auth ユーザーがあれば再利用、なければ作成
  select id into v_user_id from auth.users where email = v_email;

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token,
      email_change, email_change_token_new, email_change_token_current,
      reauthentication_token, is_sso_user
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user_id,
      'authenticated', 'authenticated',
      v_email, crypt(v_password, gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(),
      '', '', '', '', '', '', false
    );

    -- メール＋パスワードでのサインインに必要な identity 行
    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_user_id, v_user_id::text, 'email',
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
      now(), now(), now()
    );
  end if;

  -- スタッフ（管理者）として登録・紐付け
  insert into public.staff (email, name, role, icon_emoji, theme_color, auth_user_id, is_active)
  values (v_email, 'marin', 'admin', '', '#B89B5E', v_user_id, true)
  on conflict (email) do update
    set auth_user_id = excluded.auth_user_id,
        role = 'admin',
        is_active = true;

  raise notice 'オーナーアカウントを作成しました: % / パスワードはこのファイル内に記載', v_email;
end $$;
