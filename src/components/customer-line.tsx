"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Button, Card, SectionTitle } from "@/components/ui";
import { LineComposeSheet } from "@/components/line-compose";
import { useToast } from "@/components/toast";
import { dateTimeLabel, staffLabel } from "@/lib/format";
import { linkLineFriend, sendLineGallery, sendLineLink } from "@/app/(app)/customers/line-actions";

interface Friend {
  id: number;
  store_id: number;
  display_name: string | null;
  is_blocked: boolean;
  customer_id: number | null;
}

interface LogRow {
  id: number;
  kind: string;
  body: string | null;
  image_count: number;
  created_at: string;
  sender: { name: string; icon_emoji: string | null } | null;
}

const KIND_LABEL: Record<string, string> = {
  message: "メッセージ",
  counseling: "カウンセリング",
  gallery: "ビフォーアフター",
};

// 顧客ページ: 店舗のLINE公式アカウントから、この顧客へ直接メッセージ送信
export function CustomerLine({
  customerId,
  customerName,
  primaryStoreId,
}: {
  customerId: number;
  customerName: string;
  primaryStoreId: number | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const notify = useToast();
  const [linked, setLinked] = useState<Friend[]>([]);
  const [candidates, setCandidates] = useState<Friend[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  const load = useCallback(async () => {
    const [{ data: mine }, { data: history }] = await Promise.all([
      supabase
        .from("line_friends")
        .select("id, store_id, display_name, is_blocked, customer_id")
        .eq("customer_id", customerId),
      supabase
        .from("line_message_logs")
        .select("id, kind, body, image_count, created_at, sender:sent_by (name, icon_emoji)")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    setLinked((mine as Friend[]) ?? []);
    setLogs((history as unknown as LogRow[]) ?? []);

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

  const friend = linked[0];

  async function doLink(friendId: number) {
    setBusy(true);
    const res = await linkLineFriend(friendId, customerId);
    if (!res.ok) notify(res.message ?? "紐付けに失敗しました", "error");
    else notify("LINEを紐付けました");
    await load();
    setBusy(false);
  }
  async function unlink(friendId: number) {
    if (!window.confirm("このお客様とLINEの紐付けを解除しますか？")) return;
    setBusy(true);
    await linkLineFriend(friendId, null);
    await load();
    setBusy(false);
  }

  // カウンセリングシートを発行して、その入力URLをLINEで送る
  async function sendCounseling() {
    if (!friend) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("counseling_sheets")
      .insert({ customer_id: customerId })
      .select("token")
      .single();
    if (error || !data) {
      notify("カウンセリング発行に失敗しました", "error");
      setBusy(false);
      return;
    }
    const res = await sendLineLink(
      friend.id,
      "【ご来店前のお願い】カウンセリングシートのご記入をお願いいたします。",
      `${window.location.origin}/f/c/${data.token}`,
      customerId
    );
    notify(res.ok ? "カウンセリングURLを送信しました" : res.message ?? "送信に失敗しました", res.ok ? "ok" : "error");
    await load();
    setBusy(false);
  }

  // 最新のビフォーアフターを「カード（Flex）」としてLINEに送信
  async function sendGallery() {
    if (!friend) return;
    setBusy(true);
    const res = await sendLineGallery(friend.id, customerId);
    notify(res.ok ? "ビフォーアフターを送信しました" : res.message ?? "送信に失敗しました", res.ok ? "ok" : "error");
    await load();
    setBusy(false);
  }

  return (
    <Card className="p-4 space-y-3">
      <div id="line" className="scroll-mt-24" />
      <SectionTitle>LINE送信（店舗公式アカウント）</SectionTitle>

      {friend ? (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge color="ok">LINE紐付け済み</Badge>
            <span className="text-sm text-ink">{friend.display_name ?? "（名称未取得）"}</span>
            {friend.is_blocked && <Badge color="caution">ブロック中</Badge>}
          </div>
          {friend.is_blocked && (
            <p className="text-xs text-caution">お客様にブロックされているため送信できません</p>
          )}

          <Button
            className="w-full"
            disabled={busy || friend.is_blocked}
            onClick={() => setComposeOpen(true)}
          >
            ✉ LINEで送る（定型文・写真）
          </Button>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted">ワンタップで送る</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                className="whitespace-nowrap"
                disabled={busy || friend.is_blocked}
                onClick={sendCounseling}
              >
                カウンセリング
              </Button>
              <Button
                variant="secondary"
                className="whitespace-nowrap"
                disabled={busy || friend.is_blocked}
                onClick={sendGallery}
              >
                ビフォーアフター
              </Button>
            </div>
          </div>

          {logs.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-xs font-semibold text-muted">最近の送信</p>
              <ul className="divide-y divide-hairline">
                {logs.map((l) => (
                  <li key={l.id} className="py-2">
                    <p className="text-xs text-muted tnum">
                      {dateTimeLabel(l.created_at)} ・ {KIND_LABEL[l.kind] ?? l.kind}
                      {l.sender && ` ・ ${staffLabel(l.sender)}`}
                      {l.image_count > 0 && ` ・ 画像${l.image_count}枚`}
                    </p>
                    {l.body && <p className="text-sm text-ink line-clamp-2 whitespace-pre-wrap">{l.body}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-right">
            <button
              type="button"
              disabled={busy}
              onClick={() => unlink(friend.id)}
              className="min-h-11 px-2 text-xs text-muted underline underline-offset-2 hover:text-caution"
            >
              LINEの紐付けを解除
            </button>
          </div>

          <LineComposeSheet
            open={composeOpen}
            onClose={() => setComposeOpen(false)}
            onSent={load}
            friend={friend}
            customer={{ id: customerId, name: customerName }}
          />
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
    </Card>
  );
}
