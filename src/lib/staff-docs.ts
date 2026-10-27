"use client";

import { createClient } from "@/lib/supabase/client";
import type { Staff, StaffDocumentCategory } from "@/lib/types";

export const STAFF_DOCS_BUCKET = "staff-docs";
export const STAFF_DOC_MAX_BYTES = 20 * 1024 * 1024;
export const STAFF_DOC_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.webp,.csv,.xls,.xlsx,application/pdf,image/jpeg,image/png,image/webp,text/csv";

// 月ごとに配る書類（タイトルに「2026年10月」を付ける）
export const MONTHLY_CATEGORIES: StaffDocumentCategory[] = ["給与明細", "支払調書"];

// 拡張子から MIME を補う（スマホのファイル選択では type が空のことがある）
export function mimeOf(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return (
    {
      pdf: "application/pdf",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      csv: "text/csv",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }[ext] ?? "application/octet-stream"
  );
}

const normalize = (s: string) => s.normalize("NFKC").replace(/[\s　_\-・.]/g, "").toLowerCase();

// ファイル名からスタッフを推定（名前・カナ・メールの@前のどれかを含む人が1人だけなら確定）
export function matchStaffByFileName(fileName: string, staff: Staff[]): number | null {
  const name = normalize(fileName.replace(/\.[^.]+$/, ""));
  const hits = staff.filter((s) => {
    const keys = [s.name, s.kana ?? "", s.email.split("@")[0]].map(normalize).filter((k) => k.length >= 2);
    return keys.some((k) => name.includes(k));
  });
  return hits.length === 1 ? hits[0].id : null;
}

// 1ファイルをアップロードして書類として登録（登録に失敗したらファイルも消す）
export async function uploadStaffDocument(input: {
  staffId: number;
  file: File;
  category: StaffDocumentCategory;
  month: string | null;
  title: string;
  note?: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = createClient();
  const ext = input.file.name.includes(".") ? input.file.name.split(".").pop()!.toLowerCase() : "bin";
  const path = `${input.staffId}/${crypto.randomUUID()}.${ext}`;
  const mime = mimeOf(input.file);

  const up = await supabase.storage
    .from(STAFF_DOCS_BUCKET)
    .upload(path, input.file, { contentType: mime, upsert: false });
  if (up.error) {
    return { ok: false, message: `「${input.file.name}」をアップロードできませんでした（${up.error.message}）` };
  }
  const { error } = await supabase.from("staff_documents").insert({
    staff_id: input.staffId,
    category: input.category,
    month: input.month,
    title: input.title.trim() || input.file.name,
    storage_path: path,
    file_name: input.file.name,
    mime_type: mime,
    size_bytes: input.file.size,
    note: input.note?.trim() || null,
  });
  if (error) {
    await supabase.storage.from(STAFF_DOCS_BUCKET).remove([path]);
    return { ok: false, message: `「${input.file.name}」を登録できませんでした` };
  }
  return { ok: true };
}
