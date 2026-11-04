"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PASSWORD_MIN } from "@/lib/types";

// ============================================================
// スタッフ・店舗アカウントのログインパスワード設定（管理者専用）
//   ・ログインがまだない人は、マスタのメールアドレスでログインを作成して紐付ける
//   ・ログインがある人は、パスワードを上書きする（メールアドレスもマスタに合わせる）
//   パスワードは Supabase Auth にだけ保存され、このシステムの DB には残らない
// ============================================================

export type SetPasswordResult =
  | { ok: true; created: boolean; email: string }
  | { ok: false; error: string };

async function requireAdmin(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("staff")
    .select("role")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  return data?.role === "admin";
}

// メールアドレスから既存のログイン（auth ユーザー）を探す
async function findAuthUserId(admin: SupabaseClient, email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

function friendly(message: string): string {
  if (/already.*(registered|exists)|duplicate/i.test(message)) {
    return "このメールアドレスは別のログインで使われています。マスタのメールアドレスを確認してください";
  }
  if (/password/i.test(message)) {
    return `パスワードが条件を満たしていません（${PASSWORD_MIN}文字以上で設定してください）`;
  }
  if (/email/i.test(message)) {
    return "メールアドレスの形式が正しくありません（マスタのメールアドレスを確認してください）";
  }
  return `設定できませんでした（${message}）`;
}

export async function setStaffPassword(staffId: number, password: string): Promise<SetPasswordResult> {
  if (!(await requireAdmin())) return { ok: false, error: "管理者だけが設定できます" };
  if (typeof password !== "string" || password.length < PASSWORD_MIN || password.length > 72) {
    return { ok: false, error: `パスワードは${PASSWORD_MIN}〜72文字で入力してください` };
  }
  if (/\s/.test(password)) return { ok: false, error: "パスワードに空白は使えません" };

  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch {
    return {
      ok: false,
      error: "サーバーの設定（SUPABASE_SERVICE_ROLE_KEY）がないため設定できません。Vercel の環境変数を確認してください",
    };
  }

  const { data: st, error: stErr } = await admin
    .from("staff")
    .select("id, email, auth_user_id")
    .eq("id", staffId)
    .maybeSingle<{ id: number; email: string; auth_user_id: string | null }>();
  if (stErr || !st) return { ok: false, error: "スタッフが見つかりません" };
  const email = st.email.trim();
  if (!email.includes("@")) {
    return { ok: false, error: "マスタのメールアドレスが正しくありません（ログインIDになります）" };
  }

  try {
    // ① すでにログインが紐付いている → パスワードを上書き（メールもマスタに合わせる）
    if (st.auth_user_id) {
      const { error } = await admin.auth.admin.updateUserById(st.auth_user_id, {
        password,
        email,
        email_confirm: true,
      });
      if (!error) return { ok: true, created: false, email };
      if (!/not.*found/i.test(error.message)) return { ok: false, error: friendly(error.message) };
      // ログインが削除されていた場合は作り直す
    }

    // ② 同じメールのログインがあれば紐付け、なければ作成
    let userId = await findAuthUserId(admin, email);
    let created = false;
    if (userId) {
      const { error } = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
      if (error) return { ok: false, error: friendly(error.message) };
    } else {
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) return { ok: false, error: friendly(error?.message ?? "作成に失敗しました") };
      userId = data.user.id;
      created = true;
    }

    const { error: linkErr } = await admin.from("staff").update({ auth_user_id: userId }).eq("id", st.id);
    if (linkErr) {
      return {
        ok: false,
        error: /duplicate|unique/i.test(linkErr.message)
          ? "このログインは別のスタッフに紐付いています。マスタのメールアドレスを確認してください"
          : `ログインの紐付けに失敗しました（${linkErr.message}）`,
      };
    }
    return { ok: true, created, email };
  } catch (e) {
    console.error(e);
    return { ok: false, error: friendly(e instanceof Error ? e.message : String(e)) };
  }
}
