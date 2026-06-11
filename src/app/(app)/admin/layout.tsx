import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

// 管理者専用エリア。画面の出し分けに加えて、データ自体も RLS／is_admin() 関数で遮断している
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  if (me?.role !== "admin") redirect("/");

  return <>{children}</>;
}
