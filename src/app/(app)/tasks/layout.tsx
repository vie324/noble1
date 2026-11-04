import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

// 業務リストは「管理者」と「閲覧を許可されたスタッフ」だけ。
// 権限のないスタッフは URL を直接開いても今日ボードへ戻す（データ自体も RLS で返らない）
export default async function TasksLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // select("*") にしておくと、032 未適用（列がない）でもエラーにならない
  const { data: me } = await supabase
    .from("staff")
    .select("*")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle<{ role: string; can_view_tasks?: boolean }>();

  if (!me || (me.role !== "admin" && me.can_view_tasks !== true)) redirect("/");

  return <>{children}</>;
}
