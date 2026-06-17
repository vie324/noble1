"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// お客様向け公開フォームのサーバーアクション
// 認証なしで呼ばれるため、必ず token で対象1件を特定し、
// pending のものだけを更新する（service role / RLSバイパス）
// ============================================================

export async function submitCounseling(
  token: string,
  answers: Record<string, string>
): Promise<{ ok: boolean; message?: string }> {
  try {
    const supabase = createAdminClient();
    const { data: sheet } = await supabase
      .from("counseling_sheets")
      .select("id, status")
      .eq("token", token)
      .maybeSingle();

    if (!sheet) return { ok: false, message: "フォームが見つかりません" };
    if (sheet.status === "submitted")
      return { ok: false, message: "このフォームは送信済みです" };

    const { error } = await supabase
      .from("counseling_sheets")
      .update({
        answers,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      })
      .eq("id", sheet.id)
      .eq("status", "pending");

    if (error) throw error;
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "送信に失敗しました。時間をおいてお試しください" };
  }
}

// LINEリッチメニュー等の固定URL（/f/new）からの受付。
// 送信時点では顧客台帳に紐付かず、スタッフが受信箱で確認・紐付けする。
export async function submitIntake(payload: {
  name: string;
  kana: string;
  phone: string;
  storeId: number | null;
  answers: Record<string, string>;
}): Promise<{ ok: boolean; message?: string }> {
  try {
    if (!payload.name.trim()) return { ok: false, message: "お名前を入力してください" };

    const supabase = createAdminClient();
    const { error } = await supabase.from("counseling_sheets").insert({
      customer_id: null,
      status: "submitted",
      answers: payload.answers,
      submitted_at: new Date().toISOString(),
      applicant_name: payload.name.trim(),
      applicant_kana: payload.kana.trim() || null,
      applicant_phone: payload.phone.trim() || null,
      store_id: payload.storeId,
    });
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "送信に失敗しました。時間をおいてお試しください" };
  }
}

export async function signConsent(
  token: string,
  signerName: string,
  signatureDataUrl: string
): Promise<{ ok: boolean; message?: string }> {
  try {
    if (!signerName.trim()) return { ok: false, message: "お名前を入力してください" };
    if (!signatureDataUrl.startsWith("data:image/png;base64,"))
      return { ok: false, message: "署名を入力してください" };

    const supabase = createAdminClient();
    const { data: doc } = await supabase
      .from("consent_documents")
      .select("id, status")
      .eq("token", token)
      .maybeSingle();

    if (!doc) return { ok: false, message: "同意書が見つかりません" };
    if (doc.status === "signed")
      return { ok: false, message: "この同意書は署名済みです" };

    // 署名画像（PNG）を非公開バケットへ保存
    const base64 = signatureDataUrl.replace("data:image/png;base64,", "");
    const bytes = Buffer.from(base64, "base64");
    if (bytes.byteLength > 1024 * 1024)
      return { ok: false, message: "署名データが大きすぎます" };

    const path = `consent/${doc.id}-${token}.png`;
    const { error: upErr } = await supabase.storage
      .from("documents")
      .upload(path, bytes, { contentType: "image/png", upsert: true });
    if (upErr) throw upErr;

    const { error } = await supabase
      .from("consent_documents")
      .update({
        status: "signed",
        signer_name: signerName.trim(),
        signature_path: path,
        signed_at: new Date().toISOString(),
      })
      .eq("id", doc.id)
      .eq("status", "pending");

    if (error) throw error;
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "送信に失敗しました。時間をおいてお試しください" };
  }
}
