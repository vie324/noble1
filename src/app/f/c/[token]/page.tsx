import { createAdminClient } from "@/lib/supabase/admin";
import { CounselingForm } from "./counseling-form";
import type { ConsentTemplate, CounselingQuestion } from "@/lib/types";

export const dynamic = "force-dynamic";

// カウンセリングシート（お客様のスマホで入力 → カルテへ自動反映）
export default async function CounselingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let sheet: { id: number; status: string; customerName: string } | null = null;
  let questions: CounselingQuestion[] = [];
  let consentTemplates: ConsentTemplate[] = [];

  try {
    const supabase = createAdminClient();
    const [{ data: s }, { data: q }, { data: ct }] = await Promise.all([
      supabase
        .from("counseling_sheets")
        .select("id, status, customers (name)")
        .eq("token", token)
        .maybeSingle(),
      supabase
        .from("counseling_questions")
        .select("*")
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("consent_templates")
        .select("*")
        .eq("is_active", true)
        .order("sort_order"),
    ]);
    if (s) {
      const customers = s.customers as unknown as { name: string } | null;
      sheet = { id: s.id, status: s.status, customerName: customers?.name ?? "" };
    }
    questions = (q as CounselingQuestion[]) ?? [];
    consentTemplates = (ct as ConsentTemplate[]) ?? [];
  } catch (e) {
    console.error(e);
  }

  if (!sheet) {
    return (
      <div className="noble-card gold-hairline p-6 text-center">
        <p className="text-sm text-muted">
          フォームが見つかりませんでした。
          <br />
          お手数ですが、サロンまでお問い合わせください。
        </p>
      </div>
    );
  }

  if (sheet.status === "submitted") {
    return (
      <div className="noble-card gold-hairline p-6 text-center space-y-2">
        <p className="text-gold text-xs" aria-hidden>◆</p>
        <p className="serif text-xl text-ink">ご回答ありがとうございました</p>
        <p className="text-sm text-muted">
          当日はスタッフが内容を確認のうえご案内いたします。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h1 className="serif text-2xl text-ink">カウンセリングシート</h1>
        <p className="text-sm text-muted mt-1">
          {sheet.customerName} 様 ・ ご来店前にご記入をお願いいたします
        </p>
      </div>
      <CounselingForm
        token={token}
        questions={questions}
        defaultName={sheet.customerName}
        consentTemplates={consentTemplates}
      />
    </div>
  );
}
