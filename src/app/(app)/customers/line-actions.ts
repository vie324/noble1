"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreLineConfig, linePush } from "@/lib/line";

// 呼び出し元が有効なスタッフであることを確認
async function requireStaff(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("staff")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  return !!data;
}

// 友だち（line_friends）から store_id / line_user_id を解決し、その店舗のトークンで送信
async function pushToFriend(
  friendId: number,
  messages: { type: "text"; text: string }[]
): Promise<{ ok: boolean; message?: string }> {
  const admin = createAdminClient();
  const { data: friend } = await admin
    .from("line_friends")
    .select("store_id, line_user_id, is_blocked")
    .eq("id", friendId)
    .maybeSingle();
  if (!friend) return { ok: false, message: "LINE友だちが見つかりません" };
  if (friend.is_blocked) return { ok: false, message: "このお客様はLINEをブロック中です" };

  const config = await getStoreLineConfig(friend.store_id);
  if (!config?.channel_access_token || !config.is_active) {
    return { ok: false, message: "この店舗のLINE連携が未設定です（管理 > LINE連携）" };
  }
  const res = await linePush(config.channel_access_token, friend.line_user_id, messages);
  if (!res.ok) {
    console.error("LINE push failed", res.status, res.body);
    return { ok: false, message: `送信に失敗しました（${res.status}）` };
  }
  return { ok: true };
}

// 自由テキストを送信
export async function sendLineText(
  friendId: number,
  text: string
): Promise<{ ok: boolean; message?: string }> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!text.trim()) return { ok: false, message: "本文を入力してください" };
  return pushToFriend(friendId, [{ type: "text", text: text.trim() }]);
}

// 見出し＋URL を送信（カウンセリング・ビフォーアフター等の共通導線）
export async function sendLineLink(
  friendId: number,
  heading: string,
  url: string
): Promise<{ ok: boolean; message?: string }> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!/^https?:\/\//.test(url)) return { ok: false, message: "URLが不正です" };
  return pushToFriend(friendId, [{ type: "text", text: `${heading}\n${url}` }]);
}

// 友だちを顧客に紐付け／解除
export async function linkLineFriend(
  friendId: number,
  customerId: number | null
): Promise<{ ok: boolean; message?: string }> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("line_friends")
    .update({ customer_id: customerId })
    .eq("id", friendId);
  if (error) return { ok: false, message: "紐付けに失敗しました" };
  return { ok: true };
}
