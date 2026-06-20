"use server";

import { headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreLineConfig, linePush } from "@/lib/line";

// サーバーアクションから本番ドメインの絶対URLを組み立てる
async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

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
  messages: Record<string, unknown>[]
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

// 顧客の最新ビフォーアフターを「カード（Flex Message）」としてLINEに送信
//   チャット内に Before/After を並べたページ風カード＋「ページを見る」ボタンを表示
export async function sendLineGallery(
  friendId: number,
  customerId: number
): Promise<{ ok: boolean; message?: string }> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const admin = createAdminClient();

  const { data: gallery } = await admin
    .from("gallery_pages")
    .select("id, token, title, message")
    .eq("customer_id", customerId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!gallery) return { ok: false, message: "先に「ビフォーアフター」を作成してください" };

  const { data: photos } = await admin
    .from("gallery_photos")
    .select("storage_path, kind, sort_order")
    .eq("gallery_id", gallery.id)
    .order("sort_order");
  const rows = (photos as { storage_path: string; kind: string }[]) ?? [];

  // 署名URL（LINEのサーバーが画像取得するため公開アクセス可能・7日有効）
  const paths = rows.map((r) => r.storage_path);
  const urlMap = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await admin.storage
      .from("visit-photos")
      .createSignedUrls(paths, 60 * 60 * 24 * 7);
    signed?.forEach((s) => s.signedUrl && s.path && urlMap.set(s.path, s.signedUrl));
  }
  const beforeUrl = urlMap.get(rows.find((r) => r.kind === "before")?.storage_path ?? "") ?? null;
  const afterUrl = urlMap.get(rows.find((r) => r.kind === "after")?.storage_path ?? "") ?? null;

  const pageUrl = `${await siteOrigin()}/p/${gallery.token}`;

  // 画像が https でないと LINE が表示できないため、その場合はリンクのみ送信
  const httpsOk = (u: string | null) => !!u && u.startsWith("https://");
  if (!httpsOk(beforeUrl) && !httpsOk(afterUrl)) {
    return pushToFriend(friendId, [
      { type: "text", text: `施術のビフォーアフターです。ご覧ください。\n${pageUrl}` },
    ]);
  }

  const imageColumn = (label: string, url: string | null) => ({
    type: "box",
    layout: "vertical",
    spacing: "xs",
    contents: [
      { type: "text", text: label, size: "xxs", align: "center", color: "#96793F", weight: "bold" },
      url
        ? {
            type: "image",
            url,
            size: "full",
            aspectMode: "cover",
            aspectRatio: "3:4",
          }
        : { type: "box", layout: "vertical", height: "120px", contents: [], backgroundColor: "#F3ECDD" },
    ],
  });

  const bubble = {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "16px",
      backgroundColor: "#FBF8F3",
      contents: [
        {
          type: "text",
          text: gallery.title || "Before / After",
          weight: "bold",
          size: "lg",
          align: "center",
          color: "#3D352E",
        },
        {
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          contents: [imageColumn("BEFORE", beforeUrl), imageColumn("AFTER", afterUrl)],
        },
        ...(gallery.message
          ? [{ type: "text", text: gallery.message, wrap: true, size: "sm", color: "#3D352E" }]
          : []),
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#B89B5E",
          height: "sm",
          action: { type: "uri", label: "ページを見る", uri: pageUrl },
        },
      ],
    },
  };

  return pushToFriend(friendId, [
    { type: "flex", altText: "施術のビフォーアフターのご案内", contents: bubble },
  ]);
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
