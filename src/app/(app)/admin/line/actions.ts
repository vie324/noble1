"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreLineConfig, lineGetBotInfo } from "@/lib/line";

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

export interface LineConfigView {
  store_id: number;
  configured: boolean; // トークン＋シークレットが揃っている
  bot_basic_id: string | null;
  is_active: boolean;
}

// 各店舗の設定状況（トークン本体は返さない）
export async function getLineConfigViews(): Promise<LineConfigView[]> {
  if (!(await requireAdmin())) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("store_line_configs")
    .select("store_id, channel_access_token, channel_secret, bot_basic_id, is_active");
  return (
    (data as {
      store_id: number;
      channel_access_token: string | null;
      channel_secret: string | null;
      bot_basic_id: string | null;
      is_active: boolean;
    }[]) ?? []
  ).map((c) => ({
    store_id: c.store_id,
    configured: !!c.channel_access_token && !!c.channel_secret,
    bot_basic_id: c.bot_basic_id,
    is_active: c.is_active,
  }));
}

// 設定を保存（空欄のトークン/シークレットは既存値を維持）
export async function saveLineConfig(
  storeId: number,
  input: { accessToken: string; secret: string; botBasicId: string; isActive: boolean }
): Promise<{ ok: boolean; message?: string }> {
  if (!(await requireAdmin())) return { ok: false, message: "権限がありません" };
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("store_line_configs")
    .select("id")
    .eq("store_id", storeId)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    bot_basic_id: input.botBasicId.trim() || null,
    is_active: input.isActive,
  };
  if (input.accessToken.trim()) patch.channel_access_token = input.accessToken.trim();
  if (input.secret.trim()) patch.channel_secret = input.secret.trim();

  if (existing) {
    const { error } = await admin.from("store_line_configs").update(patch).eq("id", existing.id);
    if (error) return { ok: false, message: "保存に失敗しました" };
  } else {
    const { error } = await admin
      .from("store_line_configs")
      .insert({ store_id: storeId, ...patch });
    if (error) return { ok: false, message: "保存に失敗しました" };
  }
  return { ok: true };
}

// 疎通確認（Bot情報を取得）
export async function testLineConnection(
  storeId: number
): Promise<{ ok: boolean; message: string }> {
  if (!(await requireAdmin())) return { ok: false, message: "権限がありません" };
  const config = await getStoreLineConfig(storeId);
  if (!config?.channel_access_token) return { ok: false, message: "トークンが未設定です" };
  const info = await lineGetBotInfo(config.channel_access_token);
  if (!info.ok) return { ok: false, message: `接続に失敗しました（${info.status}）` };
  return { ok: true, message: `接続成功: ${info.displayName ?? ""} ${info.basicId ?? ""}` };
}
