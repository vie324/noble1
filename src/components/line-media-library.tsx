"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, SectionTitle } from "@/components/ui";
import { useToast } from "@/components/toast";
import { compressImage } from "@/lib/image";
import type { LineMedia } from "@/lib/types";

const BUCKET = "line-media";
const LINE_PREVIEW_MAX = 1000 * 1000; // LINE のプレビュー画像は 1MB まで

// 経営 > LINE連携: 送信用の画像ライブラリ（アフターケアの案内・キャンペーン画像など）
export function LineMediaLibrary() {
  const supabase = useMemo(() => createClient(), []);
  const notify = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<(LineMedia & { url: string })[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: number; title: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("line_media").select("*").order("sort_order").order("id");
    if (error) {
      setItems([]);
      return;
    }
    setItems(
      ((data as LineMedia[]) ?? []).map((m) => ({
        ...m,
        url: supabase.storage.from(BUCKET).getPublicUrl(m.storage_path).data.publicUrl,
      }))
    );
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    let done = 0;
    for (const file of list) {
      setBusy(`アップロード中… ${done + 1}/${list.length}`);
      try {
        const blob = await compressImage(file, { maxEdge: 1600, quality: 0.85, maxBytes: LINE_PREVIEW_MAX });
        const path = `${crypto.randomUUID()}.jpg`;
        const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
        if (up.error) throw new Error(up.error.message);
        const { error } = await supabase.from("line_media").insert({
          title: file.name.replace(/\.[^.]+$/, ""),
          storage_path: path,
          sort_order: (items?.length ?? 0) + done + 1,
        });
        if (error) {
          await supabase.storage.from(BUCKET).remove([path]);
          throw new Error(error.message);
        }
        done++;
      } catch {
        notify(`「${file.name}」を追加できませんでした（030_line_messaging.sql の実行が必要な場合があります）`, "error");
      }
    }
    setBusy(null);
    if (input.current) input.current.value = "";
    if (done > 0) notify(`${done}枚の画像を追加しました`);
    await load();
  }

  async function rename() {
    if (!editing) return;
    const { error } = await supabase
      .from("line_media")
      .update({ title: editing.title.trim() || "画像" })
      .eq("id", editing.id);
    if (error) notify("名前を変更できませんでした", "error");
    setEditing(null);
    await load();
  }

  async function remove(m: LineMedia) {
    if (!window.confirm(`「${m.title}」を画像ライブラリから削除しますか？\n（送信済みのLINEのトークからは消えない場合があります）`)) return;
    const { error } = await supabase.from("line_media").delete().eq("id", m.id);
    if (error) {
      notify("削除できませんでした", "error");
      return;
    }
    await supabase.storage.from(BUCKET).remove([m.storage_path]);
    notify("削除しました");
    await load();
  }

  return (
    <Card className="p-4 space-y-3">
      <SectionTitle>送る内容（定型文・画像）</SectionTitle>
      <p className="text-sm text-ink">
        スタッフは顧客ページの「LINEで送る」から、定型文と画像を選んで送信できます（送信前に必ず確認画面が出ます）。
      </p>
      <Link
        href="/admin/masters"
        className="flex items-center justify-between min-h-12 rounded-xl border border-hairline bg-base px-4 text-sm text-ink hover:border-gold transition-colors"
      >
        <span>
          定型文の編集
          <span className="block text-xs text-muted">マスタ管理 ＞ LINE定型文</span>
        </span>
        <span className="text-muted" aria-hidden>
          ›
        </span>
      </Link>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted">画像ライブラリ（アフターケアの案内・キャンペーン画像など）</p>
        <input
          ref={input}
          id="line-media-input"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          className="sr-only"
          onChange={(e) => upload(e.target.files)}
        />
        <label
          htmlFor="line-media-input"
          className="flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-gold/50 bg-gold-soft/30 px-4 py-5 text-center cursor-pointer hover:bg-gold-soft/60 transition-colors"
        >
          <span className="text-sm font-semibold text-gold-dk">{busy ?? "＋ 画像を追加（複数可）"}</span>
          <span className="text-xs text-muted">
            LINEで表示できる大きさ（1MB以下のJPEG）に自動で縮小します。お客様の写真はここに入れないでください
          </span>
        </label>
        {items === null ? null : items.length === 0 ? (
          <p className="text-xs text-muted">まだ画像はありません</p>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {items.map((m) => (
              <li key={m.id} className="rounded-xl border border-hairline bg-base overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt={m.title} className="w-full aspect-square object-cover bg-surface" />
                <div className="p-2 space-y-1">
                  {editing?.id === m.id ? (
                    <div className="flex gap-1">
                      <input
                        value={editing.title}
                        onChange={(e) => setEditing({ id: m.id, title: e.target.value })}
                        className="flex-1 min-w-0 min-h-9 rounded-lg border border-hairline bg-surface px-2 text-sm outline-none focus:border-gold"
                        aria-label="画像の名前"
                      />
                      <Button variant="secondary" onClick={rename}>
                        保存
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-ink truncate" title={m.title}>
                      {m.title}
                    </p>
                  )}
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing({ id: m.id, title: m.title })}
                      className="min-h-9 px-2 text-xs text-muted hover:text-ink"
                    >
                      名前を変更
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(m)}
                      className="min-h-9 px-2 text-xs text-muted hover:text-caution"
                    >
                      削除
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
