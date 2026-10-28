"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { sendLineComposed } from "@/app/(app)/customers/line-actions";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { Button, Chip, TextArea } from "@/components/ui";
import { dateLabelJa, jstDate, timeHM } from "@/lib/format";
import type { LineMedia, LineTemplate } from "@/lib/types";

const MAX_IMAGES = 4;
// 定型文で使える差し込み項目
type Variable = "お客様名" | "店舗名" | "担当スタッフ" | "次回予約" | "前回来店日";

interface PhotoItem {
  id: number;
  kind: "before" | "after";
  url: string | null;
  date: string;
}

type Pick = { source: "media" | "photo"; id: number };

// 定型文の {お客様名} などを、このお客様の内容に置き換える。分からない項目は【…を入力】で残す
export function fillTemplate(body: string, values: Partial<Record<Variable, string | null>>): string {
  return body.replace(/\{(お客様名|店舗名|担当スタッフ|次回予約|前回来店日)\}/g, (_, key: Variable) => {
    const v = values[key];
    return v ? v : `【${key}を入力】`;
  });
}

// LINE送信シート: 定型文・画像を選ぶ → 本文を整える → プレビューで確認 → 送信
export function LineComposeSheet({
  open,
  onClose,
  onSent,
  friend,
  customer,
}: {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
  friend: { id: number; store_id: number; display_name: string | null };
  customer: { id: number; name: string };
}) {
  const { me, storeName } = useApp();
  const supabase = useMemo(() => createClient(), []);
  const notify = useToast();

  const [templates, setTemplates] = useState<LineTemplate[]>([]);
  const [media, setMedia] = useState<(LineMedia & { url: string })[]>([]);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [values, setValues] = useState<Partial<Record<Variable, string | null>>>({});
  const [loaded, setLoaded] = useState(false);

  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [text, setText] = useState("");
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [tab, setTab] = useState<"media" | "photo">("media");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const nowIso = new Date().toISOString();
    const [tp, md, ph, next, last] = await Promise.all([
      supabase.from("line_templates").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("line_media").select("*").eq("is_active", true).order("sort_order"),
      supabase
        .from("visit_photos")
        .select("id, kind, storage_path, created_at, visits!inner (customer_id, scheduled_at)")
        .eq("visits.customer_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(24),
      supabase
        .from("visits")
        .select("scheduled_at")
        .eq("customer_id", customer.id)
        .eq("status", "scheduled")
        .gte("scheduled_at", nowIso)
        .order("scheduled_at")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("visits")
        .select("scheduled_at")
        .eq("customer_id", customer.id)
        .eq("status", "filled")
        .order("scheduled_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    setTemplates((tp.data as LineTemplate[]) ?? []);
    setMedia(
      ((md.data as LineMedia[]) ?? []).map((m) => ({
        ...m,
        url: supabase.storage.from("line-media").getPublicUrl(m.storage_path).data.publicUrl,
      }))
    );

    const rows =
      (ph.data as unknown as {
        id: number;
        kind: "before" | "after";
        storage_path: string;
        visits: { scheduled_at: string };
      }[]) ?? [];
    const urls = new Map<string, string>();
    if (rows.length > 0) {
      const { data: signed } = await supabase.storage
        .from("visit-photos")
        .createSignedUrls(rows.map((r) => r.storage_path), 60 * 60);
      signed?.forEach((s) => s.signedUrl && s.path && urls.set(s.path, s.signedUrl));
    }
    setPhotos(
      rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        url: urls.get(r.storage_path) ?? null,
        date: jstDate(r.visits.scheduled_at),
      }))
    );

    const nextAt = (next.data as { scheduled_at: string } | null)?.scheduled_at;
    const lastAt = (last.data as { scheduled_at: string } | null)?.scheduled_at;
    setValues({
      お客様名: customer.name,
      店舗名: storeName(friend.store_id),
      担当スタッフ: me.name,
      次回予約: nextAt ? `${dateLabelJa(jstDate(nextAt))} ${timeHM(nextAt)}` : null,
      前回来店日: lastAt ? dateLabelJa(jstDate(lastAt)) : null,
    });
    setLoaded(true);
  }, [supabase, customer.id, customer.name, friend.store_id, me.name, storeName]);

  useEffect(() => {
    if (open && !loaded) load();
  }, [open, loaded, load]);

  function reset() {
    setStep("edit");
    setText("");
    setTemplateId(null);
    setPicks([]);
  }

  function close() {
    onClose();
  }

  function applyTemplate(t: LineTemplate) {
    if (text.trim() && !window.confirm("入力中の本文を、この定型文に置き換えますか？")) return;
    setText(fillTemplate(t.body, values));
    setTemplateId(t.id);
  }

  function togglePick(p: Pick) {
    setPicks((list) => {
      const exists = list.some((x) => x.source === p.source && x.id === p.id);
      if (exists) return list.filter((x) => !(x.source === p.source && x.id === p.id));
      if (list.length >= MAX_IMAGES) {
        notify(`画像は一度に${MAX_IMAGES}枚までです`, "error");
        return list;
      }
      return [...list, p];
    });
  }

  const pickIndex = (p: Pick) => picks.findIndex((x) => x.source === p.source && x.id === p.id);
  const placeholderLeft = /【[^】]*を入力】/.test(text);
  const canProceed = (text.trim() !== "" || picks.length > 0) && !placeholderLeft;

  // プレビューと送信は「ライブラリ → お客様の写真」の順（サーバーの送信順と同じ）
  const ordered = [
    ...picks.filter((p) => p.source === "media"),
    ...picks.filter((p) => p.source === "photo"),
  ];
  const urlOf = (p: Pick) =>
    p.source === "media" ? media.find((m) => m.id === p.id)?.url : photos.find((x) => x.id === p.id)?.url;

  async function send() {
    setSending(true);
    const res = await sendLineComposed({
      friendId: friend.id,
      customerId: customer.id,
      text,
      templateId,
      libraryMediaIds: ordered.filter((p) => p.source === "media").map((p) => p.id),
      customerPhotoIds: ordered.filter((p) => p.source === "photo").map((p) => p.id),
    });
    setSending(false);
    if (!res.ok) {
      notify(res.message ?? "送信に失敗しました", "error");
      return;
    }
    notify(`${customer.name}様にLINEを送信しました`);
    reset();
    onSent();
    close();
  }

  const recipient = `${friend.display_name ?? "（名称未取得）"}（${storeName(friend.store_id)}のLINE）`;

  return (
    <Sheet
      open={open}
      onClose={close}
      title={step === "edit" ? "LINEで送る" : "送信内容の確認"}
      footer={
        step === "edit" ? (
          <Button className="w-full" disabled={!canProceed} onClick={() => setStep("confirm")}>
            確認へ進む
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep("edit")} disabled={sending}>
              戻る
            </Button>
            <Button className="flex-1" onClick={send} disabled={sending}>
              {sending ? "送信中…" : "この内容で送信"}
            </Button>
          </div>
        )
      }
    >
      {step === "edit" ? (
        <div className="space-y-5">
          <p className="text-xs text-muted">
            送信先: <span className="text-ink font-semibold">{recipient}</span>
          </p>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-muted">定型文を選ぶ</h3>
            {!loaded ? (
              <p className="text-sm text-muted">読み込み中…</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-muted">定型文はまだありません（経営 ＞ マスタ管理 ＞ LINE定型文 で登録できます）</p>
            ) : (
              <div className="-mx-5 px-5 overflow-x-auto no-scrollbar">
                <div className="flex gap-2 min-w-max pb-1">
                  {templates.map((t) => (
                    <Chip key={t.id} label={t.title} selected={templateId === t.id} onClick={() => applyTemplate(t)} />
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="space-y-1">
            <TextArea
              label="本文（自由に書き換えられます）"
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="定型文を選ぶか、メッセージを入力してください"
            />
            <div className="flex items-start justify-between gap-2">
              {placeholderLeft ? (
                <p className="text-xs text-warn">【…を入力】の部分を書き換えてください（自動で入れられませんでした）</p>
              ) : (
                <span />
              )}
              <span className="text-[11px] text-muted tnum shrink-0">{text.length}/5000</span>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-muted">
              画像を添える（{picks.length}/{MAX_IMAGES}・任意）
            </h3>
            <div className="grid grid-cols-2 gap-1 rounded-full bg-base p-1" role="tablist">
              {(
                [
                  ["media", "画像ライブラリ"],
                  ["photo", "このお客様の写真"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`min-h-10 px-2 rounded-full text-xs whitespace-nowrap transition-colors ${
                    tab === key ? "bg-ink text-[#FBF8F3] font-semibold shadow-sm" : "text-muted hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {(tab === "media"
                ? media.map((m) => ({ pick: { source: "media" as const, id: m.id }, url: m.url, label: m.title }))
                : photos.map((p) => ({
                    pick: { source: "photo" as const, id: p.id },
                    url: p.url,
                    label: `${p.kind === "before" ? "施術前" : "施術後"} ${p.date.slice(5).replace("-", "/")}`,
                  }))
              ).map(({ pick, url, label }) => {
                const idx = pickIndex(pick);
                return (
                  <button
                    key={`${pick.source}-${pick.id}`}
                    type="button"
                    onClick={() => togglePick(pick)}
                    aria-pressed={idx >= 0}
                    aria-label={label}
                    className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-colors ${
                      idx >= 0 ? "border-gold" : "border-transparent"
                    }`}
                  >
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-full h-full bg-base" />
                    )}
                    <span className="absolute inset-x-0 bottom-0 bg-ink/55 px-1 py-0.5 text-[10px] text-white truncate">
                      {label}
                    </span>
                    {idx >= 0 && (
                      <span className="absolute top-1 right-1 w-6 h-6 rounded-full bg-gold text-white text-xs font-bold inline-flex items-center justify-center shadow">
                        {idx + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {tab === "media" && loaded && media.length === 0 && (
              <p className="text-xs text-muted">
                画像ライブラリは空です（経営 ＞ LINE連携 で、アフターケアの案内画像などを登録できます）
              </p>
            )}
            {tab === "photo" && loaded && photos.length === 0 && (
              <p className="text-xs text-muted">このお客様のカルテに写真はまだありません</p>
            )}
          </section>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink">
            <span className="font-semibold">{customer.name}様</span>（{recipient}）に、次の内容を送信します
          </p>
          {/* LINE のトーク画面風プレビュー */}
          <div className="rounded-2xl bg-[#8CABD9]/25 p-3 space-y-2">
            {text.trim() && (
              <div className="flex">
                <p className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm text-[#222] whitespace-pre-wrap break-words shadow-sm">
                  {text.trim()}
                </p>
              </div>
            )}
            {ordered.map((p) => (
              <div key={`${p.source}-${p.id}`} className="flex">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={urlOf(p) ?? ""} alt="" className="max-w-[60%] max-h-56 rounded-2xl shadow-sm" />
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted">
            送信後は取り消せません。お客様の写真は、お客様本人のLINEにだけ届きます
          </p>
        </div>
      )}
    </Sheet>
  );
}
