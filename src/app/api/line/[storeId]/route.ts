import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreLineConfig, lineGetProfile, verifyLineSignature } from "@/lib/line";

export const dynamic = "force-dynamic";

// 店舗ごとの LINE Webhook 受信
//   LINE Developers の Webhook URL に
//   https://<本番ドメイン>/api/line/<storeId> を登録する
export async function POST(
  request: Request,
  { params }: { params: Promise<{ storeId: string }> }
) {
  const { storeId } = await params;
  const id = Number(storeId);
  if (!id) return new Response("bad request", { status: 400 });

  const raw = await request.text();
  const config = await getStoreLineConfig(id);
  if (!config?.channel_secret || !config.channel_access_token || !config.is_active) {
    return new Response("not configured", { status: 200 }); // 200で握りつぶし（LINEの再送回避）
  }

  const signature = request.headers.get("x-line-signature");
  if (!verifyLineSignature(config.channel_secret, raw, signature)) {
    return new Response("invalid signature", { status: 401 });
  }

  let payload: { events?: LineEvent[] };
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("ok", { status: 200 });
  }

  const supabase = createAdminClient();
  const token = config.channel_access_token;

  for (const ev of payload.events ?? []) {
    const userId = ev.source?.userId;
    if (!userId) continue;
    const now = new Date().toISOString();

    if (ev.type === "unfollow") {
      await supabase
        .from("line_friends")
        .update({ is_blocked: true, last_event_at: now })
        .eq("store_id", id)
        .eq("line_user_id", userId);
      continue;
    }

    // follow / message 等 → 友だちを upsert（プロフィールも取得）
    const profile = await lineGetProfile(token, userId).catch(() => null);
    const { data: existing } = await supabase
      .from("line_friends")
      .select("id")
      .eq("store_id", id)
      .eq("line_user_id", userId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("line_friends")
        .update({
          display_name: profile?.displayName ?? null,
          picture_url: profile?.pictureUrl ?? null,
          is_blocked: false,
          last_event_at: now,
          ...(ev.type === "follow" ? { followed_at: now } : {}),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("line_friends").insert({
        store_id: id,
        line_user_id: userId,
        display_name: profile?.displayName ?? null,
        picture_url: profile?.pictureUrl ?? null,
        followed_at: ev.type === "follow" ? now : null,
        last_event_at: now,
      });
    }
  }

  return new Response("ok", { status: 200 });
}

interface LineEvent {
  type: string;
  source?: { userId?: string };
}
