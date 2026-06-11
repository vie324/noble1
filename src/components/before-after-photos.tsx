"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";
import type { PhotoKind, VisitPhoto } from "@/lib/types";

// クライアント側で長辺1600px・JPEG品質0.82に圧縮してからアップロードする
async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("圧縮に失敗しました"))),
      "image/jpeg",
      0.82
    );
  });
}

interface PhotoWithUrl extends VisitPhoto {
  signedUrl: string | null;
}

export function BeforeAfterPhotos({ visitId }: { visitId: number }) {
  const [photos, setPhotos] = useState<PhotoWithUrl[] | null>(null);
  const [uploading, setUploading] = useState<PhotoKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("visit_photos")
      .select("*")
      .eq("visit_id", visitId)
      .order("id");
    const rows = (data as VisitPhoto[]) ?? [];

    const withUrls: PhotoWithUrl[] = await Promise.all(
      rows.map(async (p) => {
        const { data: signed } = await supabase.storage
          .from("visit-photos")
          .createSignedUrl(p.storage_path, 60 * 60);
        return { ...p, signedUrl: signed?.signedUrl ?? null };
      })
    );
    setPhotos(withUrls);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId]);

  async function handleUpload(kind: PhotoKind, file: File) {
    setError(null);
    setUploading(kind);
    try {
      const supabase = createClient();
      const blob = await compressImage(file);
      const path = `${visitId}/${kind}-${crypto.randomUUID()}.jpg`;

      const { error: upErr } = await supabase.storage
        .from("visit-photos")
        .upload(path, blob, { contentType: "image/jpeg" });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase
        .from("visit_photos")
        .insert({ visit_id: visitId, kind, storage_path: path });
      if (insErr) throw insErr;

      await load();
    } catch (e) {
      console.error(e);
      setError("写真のアップロードに失敗しました");
    } finally {
      setUploading(null);
    }
  }

  async function handleDelete(photo: PhotoWithUrl) {
    if (!window.confirm("この写真を削除しますか？")) return;
    const supabase = createClient();
    await supabase.from("visit_photos").delete().eq("id", photo.id);
    await supabase.storage.from("visit-photos").remove([photo.storage_path]);
    await load();
  }

  return (
    <div className="space-y-3">
      {/* Before / After を並べて比較表示 */}
      <div className="grid grid-cols-2 gap-3">
        {(["before", "after"] as const).map((kind) => (
          <PhotoColumn
            key={kind}
            kind={kind}
            photos={(photos ?? []).filter((p) => p.kind === kind)}
            uploading={uploading === kind}
            onUpload={(f) => handleUpload(kind, f)}
            onDelete={handleDelete}
            loading={photos === null}
          />
        ))}
      </div>
      {error && (
        <p className="text-sm text-caution bg-caution-soft rounded-lg px-3 py-2">{error}</p>
      )}
    </div>
  );
}

function PhotoColumn({
  kind,
  photos,
  uploading,
  loading,
  onUpload,
  onDelete,
}: {
  kind: PhotoKind;
  photos: PhotoWithUrl[];
  uploading: boolean;
  loading: boolean;
  onUpload: (file: File) => void;
  onDelete: (photo: PhotoWithUrl) => void;
}) {
  const inputId = `photo-${kind}`;
  return (
    <div className="space-y-2">
      <p className="serif text-sm font-semibold text-gold-dk text-center tracking-widest uppercase">
        {kind === "before" ? "Before" : "After"}
      </p>

      {loading ? (
        <div className="skeleton aspect-[3/4] w-full" />
      ) : (
        photos.map((p) =>
          p.signedUrl ? (
            <div key={p.id} className="relative group">
              {/* eslint-disable-next-line @next/next/no-img-element -- 署名付きURLのため next/image 最適化対象外 */}
              <img
                src={p.signedUrl}
                alt={`${kind === "before" ? "施術前" : "施術後"}の写真`}
                className="w-full rounded-xl border border-hairline object-cover"
              />
              <button
                type="button"
                onClick={() => onDelete(p)}
                aria-label="写真を削除"
                className="absolute top-2 right-2 min-h-9 min-w-9 rounded-full bg-ink/60 text-white text-sm backdrop-blur"
              >
                ✕
              </button>
            </div>
          ) : null
        )
      )}

      {/* capture なし = iPad でカメラ／ライブラリ両方選択可 */}
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = "";
        }}
      />
      <label
        htmlFor={inputId}
        className={`flex items-center justify-center min-h-11 rounded-xl border border-dashed border-gold/60 text-sm text-gold-dk cursor-pointer hover:bg-gold-soft transition-colors ${
          uploading ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        {uploading ? "アップロード中…" : "＋ 写真を追加"}
      </label>
    </div>
  );
}
