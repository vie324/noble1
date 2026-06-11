import "server-only";
import { createClient } from "@supabase/supabase-js";

// service role クライアント（RLSをバイパスする。サーバー専用）
// お客様向け公開フォーム（/f/...）のトークン検証付き読み書きにのみ使用する。
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY が未設定です（公開フォーム機能に必要）"
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
