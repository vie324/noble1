"use client";

// 画像をブラウザで縮小・JPEG に変換してからアップロードする（通信量と保存容量の節約）
//   maxBytes を指定すると、そのサイズに収まるまで画質を下げる（LINE のプレビュー画像は 1MB まで）
export async function compressImage(
  file: Blob,
  { maxEdge = 1600, quality = 0.82, maxBytes }: { maxEdge?: number; quality?: number; maxBytes?: number } = {}
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const encode = (q: number) =>
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("圧縮に失敗しました"))), "image/jpeg", q);
    });

  let q = quality;
  let blob = await encode(q);
  while (maxBytes && blob.size > maxBytes && q > 0.45) {
    q -= 0.1;
    blob = await encode(q);
  }
  return blob;
}
