import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { AppProvider } from "@/lib/app-context";
import { AppShell } from "@/components/app-shell";
import type { Staff, Store } from "@/lib/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: me }, { data: stores }] = await Promise.all([
    supabase
      .from("staff")
      .select("*")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .maybeSingle<Staff>(),
    supabase
      .from("stores")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
      .returns<Store[]>(),
  ]);

  // auth ユーザーはあるが staff 登録がない場合はログアウト扱い
  if (!me) {
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <AppProvider me={me} stores={stores ?? []}>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
