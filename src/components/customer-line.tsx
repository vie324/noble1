"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Button, Card, SectionTitle, TextArea } from "@/components/ui";
import {
  linkLineFriend,
  sendLineLink,
  sendLineText,
} from "@/app/(app)/customers/line-actions";

interface Friend {
  id: number;
  store_id: number;
  display_name: string | null;
  is_blocked: boolean;
  customer_id: number | null;
}

// 顧客ページ: 店舗のLINE公式アカウントから、この顧客へ直接メッセージ送信
export function CustomerLine({
  customerId,
  primaryStoreId,
}: {
  customerId: number;
  primaryStoreId: number | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [linked, setLinked] = useState<Friend[]>([]);
  const [candidates, setCandidates] = useState<Friend[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: mine } = await supabase
      .from("line_friends")
      .select("id, store_id, display_name, is_blocked, customer_id")
      .eq("customer_id", customerId);
    setLinked((mine as Friend[]) ?? []);

    // この顧客の主担当店舗の「未紐付け」友だち（紐付け候補）
    if (primaryStoreId) {
      const { data: unlinked } = await supabase
        .from("line_friends")
        .select("id, store_id, display_name, is_blocked, customer_id")
        .is("customer_id", null)
        .eq("store_id", primaryStoreId)
        .order("last_event_at", { ascending: false })
        .limit(20);
      setCandidates((unlinked as Friend[]) ?? []);
    }
  }, [supabase, customerId, primaryStoreId]);

  useEffect(() => {
    load();
  }, [load]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const friend = linked[0];

  async function doLink(friendId: number) {
    setBusy(true);
    setMessage(null);
    const res = await linkLineFriend(friendId, customerId);
    if (!res.ok) setMessage(res.message ?? "紐付けに失敗しました");
    await load();
    setBusy(false);
  }
  async function unlink(friendId: number) {
    setBusy(true);
    await linkLineFriend(friendId, null);
    await load();
    setBusy(false);
  }

  async function sendText() {
    if (!friend) return;
    setBusy(true);
    setMessage(null);
    const res = await sendLineText(friend.id, text);
    setMessage(res.ok ? "送信しました" : res.message ?? "送信に失敗しました");
    if (res.ok) setText("");
    setBusy(false);
  }

  // カウンセリングシートを発行して、その入力URLをLINEで送る
  async function sendCounseling() {
    if (!friend) return;
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase
      .from("counseling_sheets")
      .insert({ customer_id: customerId })
      .select("token")
      .single();
    if (error || !data) {
      setMessage("カウンセリング発行に失敗しました");
      setBusy(false);
      return;
    }
    const res = await sendLineLink(
      friend.id,
      "【ご来店前のお願い】カウンセリングシートのご記入をお願いいたします。",
      `${origin}/f/c/${data.token}`
    );
    setMessage(res.ok ? "カウンセリングURLを送信しました" : res.message ?? "送信に失敗しました");
    setBusy(false);
  }

  // 最新のビフォーアフターページをLINEで送る
  async function sendGallery() {
    if (!friend) return;
    setBusy(true);
    setMessage(null);
    const { data } = await supabase
      .from("gallery_pages")
      .select("token")
      .eq("customer_id", customerId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) {
      setMessage("先に「ビフォーアフター」を作成してください");
      setBusy(false);
      return;
    }
    const res = await sendLineLink(
      friend.id,
      "施術のビフォーアフターです。ご覧ください。",
      `${origin}/p/${data.token}`
    );
    setMessage(res.ok ? "ビフォーアフターを送信しました" : res.message ?? "送信に失敗しました");
    setBusy(false);
  }

  return (
    <Card className="p-4 space-y-3">
      <SectionTitle>LINE送信（店舗公式アカウント）</SectionTitle>

      {friend ? (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge color="ok">LINE紐付け済み</Badge>
            <span className="text-sm text-ink">{friend.display_name ?? "（名称未取得）"}</span>
            {friend.is_blocked && <Badge color="caution">ブロック中</Badge>}
            <span className="flex-1" />
            <Button variant="ghost" disabled={busy} onClick={() => unlink(friend.id)}>
              紐付け解除
            </Button>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" disabled={busy} onClick={sendCounseling}>
              カウンセリングを送る
            </Button>
            <Button variant="secondary" disabled={busy} onClick={sendGallery}>
              ビフォーアフターを送る
            </Button>
          </div>

          <TextArea
            label="自由メッセージ"
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="本日はありがとうございました。…"
          />
          <Button disabled={busy || !text.trim()} onClick={sendText}>
            {busy ? "送信中…" : "メッセージを送信"}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">
            このお客様はまだLINE友だちと紐付いていません。お客様が店舗のLINEを友だち追加すると、
            下に候補が表示されます。
          </p>
          {candidates.length > 0 ? (
            <ul className="divide-y divide-hairline">
              {candidates.map((c) => (
                <li key={c.id} className="py-2 flex items-center gap-2">
                  <span className="text-sm text-ink flex-1">
                    {c.display_name ?? "（名称未取得）"}
                  </span>
                  <Button variant="ghost" disabled={busy} onClick={() => doLink(c.id)}>
                    このお客様に紐付け
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">
              紐付け候補（主担当店舗の未紐付け友だち）はありません。
            </p>
          )}
        </>
      )}

      {message && (
        <p
          className={`text-sm rounded-lg px-3 py-2 ${
            message.includes("失敗") || message.includes("ください") || message.includes("権限")
              ? "text-caution bg-caution-soft"
              : "text-ok bg-ok-soft"
          }`}
        >
          {message}
        </p>
      )}
    </Card>
  );
}
