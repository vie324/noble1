"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { addMonths, thisMonthJST } from "@/lib/format";
import {
  importSalonOneMonths,
  listSalonOneShops,
  salonOneErrorMessage,
  type SalonOneShop,
} from "@/lib/salonone";

async function requireAdmin(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("staff")
    .select("role")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  return data?.role === "admin";
}

// 年度（9月〜翌8月）のうち今月までをサロンワンから取り込む（経営サマリーの「取り込む」ボタン）
export async function importSalonOneFiscalYear(
  fyStart: string
): Promise<{ ok: boolean; message: string }> {
  if (!(await requireAdmin())) return { ok: false, message: "権限がありません" };
  if (!/^\d{4}-\d{2}-01$/.test(fyStart)) return { ok: false, message: "年度の指定が不正です" };

  const current = thisMonthJST();
  if (fyStart > current) return { ok: true, message: "この年度はまだ始まっていません" };
  const last = addMonths(fyStart, 11) < current ? addMonths(fyStart, 11) : current;
  try {
    const { months } = await importSalonOneMonths(fyStart, last);
    return { ok: true, message: `サロンワンから${months}ヶ月分を取り込みました` };
  } catch (e) {
    console.error("[salonone import]", e);
    return { ok: false, message: salonOneErrorMessage(e) };
  }
}

// サロンワンの店舗一覧（目標設定ページの対応づけ用）
export async function getSalonOneShops(): Promise<
  { ok: true; shops: SalonOneShop[] } | { ok: false; message: string }
> {
  if (!(await requireAdmin())) return { ok: false, message: "権限がありません" };
  try {
    return { ok: true, shops: await listSalonOneShops() };
  } catch (e) {
    console.error("[salonone shops]", e);
    return { ok: false, message: salonOneErrorMessage(e) };
  }
}
