/**
 * シードスタッフの auth ユーザーを作成し、staff.auth_user_id に紐付けるスクリプト。
 *
 * 使い方:
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/create-users.mjs
 *
 * パスワードは初期値（下記）。本番運用前に必ず変更すること。
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を環境変数で指定してください");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const users = [
  { email: "admin@noble.example.com",  password: "noble-admin-2026",  name: "坂井 オーナー" },
  { email: "misaki@noble.example.com", password: "noble-misaki-2026", name: "田中 美咲" },
  { email: "hanako@noble.example.com", password: "noble-hanako-2026", name: "佐藤 花子" },
  { email: "ayaka@noble.example.com",  password: "noble-ayaka-2026",  name: "鈴木 彩香" },
];

for (const u of users) {
  const { data, error } = await admin.auth.admin.createUser({
    email: u.email,
    password: u.password,
    email_confirm: true,
  });

  if (error) {
    console.error(`✗ ${u.email}: ${error.message}`);
    continue;
  }

  const { error: linkError } = await admin
    .from("staff")
    .update({ auth_user_id: data.user.id })
    .eq("email", u.email);

  if (linkError) {
    console.error(`✗ staff紐付け失敗 ${u.email}: ${linkError.message}`);
  } else {
    console.log(`✓ ${u.name} (${u.email}) を作成・紐付けしました`);
  }
}

console.log("完了。初期パスワードは scripts/create-users.mjs を参照してください。");
