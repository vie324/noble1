import { createAdminClient } from "@/lib/supabase/admin";
import { IntakeForm } from "./intake-form";
import type { CounselingQuestion, Store } from "@/lib/types";

export const dynamic = "force-dynamic";

// LINEリッチメニュー等の固定URLからアクセスされる受付フォーム（認証不要）
export default async function IntakePage() {
  let questions: CounselingQuestion[] = [];
  let stores: Store[] = [];

  try {
    const supabase = createAdminClient();
    const [{ data: q }, { data: s }] = await Promise.all([
      supabase
        .from("counseling_questions")
        .select("*")
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("stores")
        .select("*")
        .eq("is_active", true)
        .order("sort_order"),
    ]);
    questions = (q as CounselingQuestion[]) ?? [];
    stores = (s as Store[]) ?? [];
  } catch (e) {
    console.error(e);
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h1 className="serif text-2xl text-ink">カウンセリングシート</h1>
        <p className="text-sm text-muted mt-1">
          ご来店前にご記入いただくと、当日スムーズにご案内できます
        </p>
      </div>
      <IntakeForm questions={questions} stores={stores} />
    </div>
  );
}
