import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

// シフト管理は管理者専用（データ自体も RLS で保護）
export default async function ShiftManageLayout({
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

  if (me?.role !== "admin") redirect("/calendar");

  return <>{children}</>;
}
