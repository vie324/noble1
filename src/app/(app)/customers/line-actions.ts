"use server";

import { headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreLineConfig, linePush } from "@/lib/line";

// LINE の1回の送信で送れるメッセージは5件まで（本文1件＋画像4枚）
const MAX_IMAGES = 4;
const MAX_TEXT = 5000;
// お客様の施術写真を LINE で表示するための署名URLの有効期間（LINE のサーバーが取得するため長めに）
const PHOTO_URL_TTL = 60 * 60 * 24 * 30;

// サーバーアクションから本番ドメインの絶対URLを組み立てる
async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// 呼び出し元が有効なスタッフであることを確認（スタッフIDを返す）
async function requireStaff(): Promise<number | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("staff")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  return data?.id ?? null;
}

interface SendLog {
  staffId: number;
  customerId?: number | null;
  kind: "message" | "counseling" | "gallery";
  body: string | null;
  imageCount?: number;
  templateId?: number | null;
}

// 友だち（line_friends）から store_id / line_user_id を解決し、その店舗のトークンで送信。成功したら履歴に残す
async function pushToFriend(
  friendId: number,
  messages: Record<string, unknown>[],
  log: SendLog
): Promise<{ ok: boolean; message?: string }> {
  const admin = createAdminClient();
  const { data: friend } = await admin
    .from("line_friends")
    .select("store_id, line_user_id, is_blocked, customer_id")
    .eq("id", friendId)
    .maybeSingle();
  if (!friend) return { ok: false, message: "LINE友だちが見つかりません" };
  if (friend.is_blocked) return { ok: false, message: "このお客様はLINEをブロック中です" };

  const config = await getStoreLineConfig(friend.store_id);
  if (!config?.channel_access_token || !config.is_active) {
    return { ok: false, message: "この店舗のLINE連携が未設定です（経営 > LINE連携）" };
  }
  const res = await linePush(config.channel_access_token, friend.line_user_id, messages);
  if (!res.ok) {
    console.error("LINE push failed", res.status, res.body);
    return { ok: false, message: `送信に失敗しました（${res.status}）` };
  }

  // 送信履歴（失敗しても送信自体は成功しているので、結果は ok のまま）
  const { error } = await admin.from("line_message_logs").insert({
    customer_id: log.customerId ?? friend.customer_id,
    line_friend_id: friendId,
    store_id: friend.store_id,
    sent_by: log.staffId,
    template_id: log.templateId ?? null,
    kind: log.kind,
    body: log.body,
    image_count: log.imageCount ?? 0,
  });
  if (error) console.error("line_message_logs insert failed", error.message);
  return { ok: true };
}

// 自由テキストを送信
export async function sendLineText(
  friendId: number,
  text: string
): Promise<{ ok: boolean; message?: string }> {
  const staffId = await requireStaff();
  if (!staffId) return { ok: false, message: "権限がありません" };
  if (!text.trim()) return { ok: false, message: "本文を入力してください" };
  return pushToFriend(friendId, [{ type: "text", text: text.trim() }], {
    staffId,
    kind: "message",
    body: text.trim(),
  });
}

// 定型文・画像を組み合わせて送信（スタッフが内容を確認してから送る）
//   libraryMediaIds: 画像ライブラリ（公開バケット line-media）
//   customerPhotoIds: この顧客の施術写真（非公開の visit-photos。署名URLで渡す）
export async function sendLineComposed(input: {
  friendId: number;
  customerId: number;
  text: string;
  templateId: number | null;
  libraryMediaIds: number[];
  customerPhotoIds: number[];
}): Promise<{ ok: boolean; message?: string }> {
  const staffId = await requireStaff();
  if (!staffId) return { ok: false, message: "権限がありません" };

  const text = input.text.trim();
  const imageTotal = input.libraryMediaIds.length + input.customerPhotoIds.length;
  if (!text && imageTotal === 0) return { ok: false, message: "本文か画像を選んでください" };
  if (text.length > MAX_TEXT) return { ok: false, message: `本文は${MAX_TEXT}文字以内にしてください` };
  if (imageTotal > MAX_IMAGES) return { ok: false, message: `画像は一度に${MAX_IMAGES}枚までです` };
  if (/【[^】]*を入力】/.test(text)) {
    return { ok: false, message: "本文に【…を入力】が残っています。内容を書き換えてから送信してください" };
  }

  const admin = createAdminClient();

  // 送信先の友だちが、この顧客に紐付いていることを確認
  const { data: friend } = await admin
    .from("line_friends")
    .select("customer_id")
    .eq("id", input.friendId)
    .maybeSingle();
  if (!friend || friend.customer_id !== input.customerId) {
    return { ok: false, message: "このお客様のLINEではありません（紐付けを確認してください）" };
  }

  const imageUrls: string[] = [];

  if (input.libraryMediaIds.length > 0) {
    const { data: media } = await admin
      .from("line_media")
      .select("id, storage_path")
      .in("id", input.libraryMediaIds)
      .eq("is_active", true);
    const byId = new Map(((media as { id: number; storage_path: string }[]) ?? []).map((m) => [m.id, m]));
    for (const id of input.libraryMediaIds) {
      const m = byId.get(id);
      if (!m) return { ok: false, message: "選んだ画像が見つかりません（削除された可能性があります）" };
      imageUrls.push(admin.storage.from("line-media").getPublicUrl(m.storage_path).data.publicUrl);
    }
  }

  if (input.customerPhotoIds.length > 0) {
    // 他のお客様の写真を送らないよう、この顧客のカルテの写真に限定する
    const { data: photos } = await admin
      .from("visit_photos")
      .select("id, storage_path, visits!inner (customer_id)")
      .in("id", input.customerPhotoIds)
      .eq("visits.customer_id", input.customerId);
    const rows = (photos as unknown as { id: number; storage_path: string }[]) ?? [];
    if (rows.length !== input.customerPhotoIds.length) {
      return { ok: false, message: "このお客様の写真ではないものが含まれています" };
    }
    const { data: signed } = await admin.storage
      .from("visit-photos")
      .createSignedUrls(
        input.customerPhotoIds.map((id) => rows.find((r) => r.id === id)!.storage_path),
        PHOTO_URL_TTL
      );
    for (const s of signed ?? []) {
      if (!s.signedUrl) return { ok: false, message: "写真のリンクを作成できませんでした" };
      imageUrls.push(s.signedUrl);
    }
  }

  const messages: Record<string, unknown>[] = [
    ...(text ? [{ type: "text", text }] : []),
    ...imageUrls.map((url) => ({ type: "image", originalContentUrl: url, previewImageUrl: url })),
  ];

  return pushToFriend(input.friendId, messages, {
    staffId,
    customerId: input.customerId,
    kind: "message",
    body: text || null,
    imageCount: imageUrls.length,
    templateId: input.templateId,
  });
}

// 見出し＋URL を送信（カウンセリング・ビフォーアフター等の共通導線）
export async function sendLineLink(
  friendId: number,
  heading: string,
  url: string,
  customerId?: number
): Promise<{ ok: boolean; message?: string }> {
  const staffId = await requireStaff();
  if (!staffId) return { ok: false, message: "権限がありません" };
  if (!/^https?:\/\//.test(url)) return { ok: false, message: "URLが不正です" };
  return pushToFriend(friendId, [{ type: "text", text: `${heading}\n${url}` }], {
    staffId,
    customerId,
    kind: "counseling",
    body: heading,
  });
}

// 顧客の最新ビフォーアフターを「カード（Flex Message）」としてLINEに送信
//   チャット内に Before/After を並べたページ風カード＋「ページを見る」ボタンを表示
export async function sendLineGallery(
  friendId: number,
  customerId: number
): Promise<{ ok: boolean; message?: string }> {
  const staffId = await requireStaff();
  if (!staffId) return { ok: false, message: "権限がありません" };
  const admin = createAdminClient();
  const log: SendLog = { staffId, customerId, kind: "gallery", body: "ビフォーアフターのご案内" };

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
    return pushToFriend(
      friendId,
      [{ type: "text", text: `施術のビフォーアフターです。ご覧ください。\n${pageUrl}` }],
      log
    );
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

  return pushToFriend(
    friendId,
    [{ type: "flex", altText: "施術のビフォーアフターのご案内", contents: bubble }],
    log
  );
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
