"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Button, Card, SectionTitle, TextArea, TextField } from "@/components/ui";
import { dateSlash } from "@/lib/format";
import type { GalleryPage } from "@/lib/types";

interface PhotoItem {
  id: number;
  kind: "before" | "after";
  storage_path: string;
  scheduled_at: string;
  url: string | null;
}

// 顧客ページ: お客様にお見せするビフォーアフターページの作成・共有
export function CustomerGallery({
  customerId,
  lineChatUrl,
}: {
  customerId: number;
  lineChatUrl: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [galleries, setGalleries] = useState<GalleryPage[]>([]);
  const [creating, setCreating] = useState(false);
  const [photos, setPhotos] = useState<PhotoItem[] | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [title, setTitle] = useState("Before / After");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("gallery_pages")
      .select("*")
      .eq("customer_id", customerId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    setGalleries((data as GalleryPage[]) ?? []);
  }, [supabase, customerId]);

  useEffect(() => {
    load();
  }, [load]);

  async function openCreate() {
    setCreating(true);
    setPhotos(null);
    setSelected([]);
    const { data } = await supabase
      .from("visit_photos")
      .select("id, kind, storage_path, visits!inner (customer_id, scheduled_at)")
      .eq("visits.customer_id", customerId)
      .order("id", { ascending: false });
    const rows = ((data as unknown as {
      id: number;
      kind: "before" | "after";
      storage_path: string;
      visits: { scheduled_at: string } | null;
    }[]) ?? []).map((r) => ({
      id: r.id,
      kind: r.kind,
      storage_path: r.storage_path,
      scheduled_at: r.visits?.scheduled_at ?? "",
    }));

    let withUrls: PhotoItem[] = rows.map((r) => ({ ...r, url: null }));
    if (rows.length > 0) {
      const { data: signed } = await supabase.storage
        .from("visit-photos")
        .createSignedUrls(rows.map((r) => r.storage_path), 60 * 60);
      const map = new Map<string, string>();
      signed?.forEach((s) => s.signedUrl && s.path && map.set(s.path, s.signedUrl));
      withUrls = rows.map((r) => ({ ...r, url: map.get(r.storage_path) ?? null }));
    }
    setPhotos(withUrls);
  }

  async function create() {
    if (selected.length === 0) return;
    setBusy(true);
    const { data: g, error } = await supabase
      .from("gallery_pages")
      .insert({ customer_id: customerId, title: title.trim() || "Before / After", message: message.trim() || null })
      .select("id, token")
      .single();
    if (error || !g) {
      setBusy(false);
      return;
    }
    const chosen = (photos ?? []).filter((p) => selected.includes(p.id));
    // before を先に、after を後に並べる
    const ordered = [...chosen].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "before" ? -1 : 1));
    await supabase.from("gallery_photos").insert(
      ordered.map((p, i) => ({
        gallery_id: g.id,
        storage_path: p.storage_path,
        kind: p.kind,
        sort_order: i,
      }))
    );
    setCreating(false);
    await load();
    setBusy(false);
  }

  function pageUrl(token: string) {
    return `${window.location.origin}/p/${token}`;
  }
  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(pageUrl(token));
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("このURLをコピーしてください", pageUrl(token));
    }
  }
  async function deleteGallery(g: GalleryPage) {
    if (!window.confirm("このページを削除しますか？")) return;
    setBusy(true);
    await supabase.from("gallery_pages").update({ is_active: false }).eq("id", g.id);
    await load();
    setBusy(false);
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <SectionTitle className="flex-1">ビフォーアフター（お客様共有用）</SectionTitle>
        <Button variant="ghost" onClick={() => (creating ? setCreating(false) : openCreate())}>
          {creating ? "閉じる" : "＋ 作成"}
        </Button>
      </div>

      {/* 作成パネル */}
      {creating && (
        <div className="rounded-xl border border-gold/40 bg-gold-soft/30 p-3 space-y-3 fade-in">
          <TextField label="タイトル" value={title} onChange={(e) => setTitle(e.target.value)} />
          <TextArea
            label="お客様へのメッセージ（任意）"
            rows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="施術前後の変化です。引き続きホームケアも頑張りましょう！"
          />
          <p className="text-xs font-semibold text-muted">掲載する写真を選択</p>
          {photos === null ? (
            <p className="text-sm text-muted">読み込み中…</p>
          ) : photos.length === 0 ? (
            <p className="text-sm text-muted">この方の施術写真がまだありません</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {photos.map((p) => {
                const on = selected.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setSelected(on ? selected.filter((x) => x !== p.id) : [...selected, p.id])
                    }
                    className={`relative rounded-lg overflow-hidden border-2 transition-colors ${
                      on ? "border-gold" : "border-transparent"
                    }`}
                  >
                    {p.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.url} alt="" className="w-full aspect-square object-cover" />
                    ) : (
                      <div className="w-full aspect-square bg-base" />
                    )}
                    <span className="absolute top-1 left-1">
                      <Badge color={p.kind === "before" ? "warn" : "ok"}>
                        {p.kind === "before" ? "前" : "後"}
                      </Badge>
                    </span>
                    {on && (
                      <span className="absolute inset-0 bg-gold/15 flex items-center justify-center text-gold-dk font-bold">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <Button disabled={busy || selected.length === 0} onClick={create}>
            {busy ? "作成中…" : `この${selected.length}枚でページを作成`}
          </Button>
        </div>
      )}

      {/* 作成済みページ一覧 */}
      {galleries.length === 0 ? (
        !creating && <p className="text-sm text-muted">まだ作成されていません</p>
      ) : (
        <ul className="space-y-2">
          {galleries.map((g) => (
            <li
              key={g.id}
              className="rounded-xl border border-hairline p-3 flex items-center gap-2 flex-wrap"
            >
              <span className="text-sm text-ink">{g.title}</span>
              <span className="text-xs text-muted tnum">{dateSlash(g.created_at)}</span>
              <span className="flex-1" />
              <a href={`/p/${g.token}`} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost">開く</Button>
              </a>
              <Button variant="ghost" onClick={() => copyLink(g.token)}>
                {copied === g.token ? "✓ コピー済み" : "リンクをコピー"}
              </Button>
              {lineChatUrl && (
                <a href={lineChatUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost">LINEで送る</Button>
                </a>
              )}
              <Button variant="ghost" onClick={() => deleteGallery(g)}>
                削除
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted">
        リンクをコピーして LINE に貼り付けると、お客様がスマホで閲覧できます（写真は7日間表示）
      </p>
    </Card>
  );
}
