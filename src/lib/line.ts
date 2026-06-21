import "server-only";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// 店舗ごとの LINE Messaging API 連携（サーバー専用）
// トークン／シークレットは store_line_configs から service role で取得し、
// クライアントには一切渡さない。
// ============================================================

export interface StoreLineConfig {
  store_id: number;
  channel_access_token: string | null;
  channel_secret: string | null;
  bot_basic_id: string | null;
  is_active: boolean;
}

export async function getStoreLineConfig(storeId: number): Promise<StoreLineConfig | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("store_line_configs")
    .select("store_id, channel_access_token, channel_secret, bot_basic_id, is_active")
    .eq("store_id", storeId)
    .maybeSingle();
  return (data as StoreLineConfig) ?? null;
}

// X-Line-Signature の検証（Webhook）
export function verifyLineSignature(channelSecret: string, rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const hmac = crypto.createHmac("sha256", channelSecret).update(rawBody).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature));
  } catch {
    return false;
  }
}

// push（特定ユーザーへ送信）。messages は LINE のメッセージオブジェクト配列
export async function linePush(
  token: string,
  to: string,
  messages: Record<string, unknown>[]
): Promise<{ ok: boolean; status: number; body?: string }> {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to, messages }),
  });
  if (res.ok) return { ok: true, status: res.status };
  return { ok: false, status: res.status, body: await res.text().catch(() => "") };
}

// 友だちのプロフィール取得
export async function lineGetProfile(
  token: string,
  userId: string
): Promise<{ displayName?: string; pictureUrl?: string } | null> {
  const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

// チャネルの疎通確認（Bot情報取得）
export async function lineGetBotInfo(
  token: string
): Promise<{ ok: boolean; status: number; basicId?: string; displayName?: string }> {
  const res = await fetch("https://api.line.me/v2/bot/info", {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { ok: false, status: res.status };
  const j = await res.json();
  return { ok: true, status: 200, basicId: j.basicId, displayName: j.displayName };
}
