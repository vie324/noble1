import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

// 個人向けの画面（マイシフト・マイ書類・請求書）は、店舗アカウント（iPad の共用ログイン）では開けない。
// URL を直接開いた場合も今日ボードへ戻す（データ自体も本人分しか返らない RLS で保護済み）
export async function redirectStoreAccount(to = "/") {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase
    .from("staff")
    .select("role")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (me?.role === "store") redirect(to);
}
