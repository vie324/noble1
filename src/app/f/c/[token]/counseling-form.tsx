"use client";

import { useState, useTransition } from "react";
import { submitCounseling, submitCounselingWithConsents, type ConsentSignature } from "../../actions";
import { CounselingFields, hasUncheckedAck } from "@/components/counseling-fields";
import { ConsentStep, matchedConsentTemplates } from "@/components/consent-step";
import type { ConsentTemplate, CounselingQuestion } from "@/lib/types";

// 特定のお客様あてに発行したトークン付きフォーム（カウンセリング → 同意書署名）
export function CounselingForm({
  token,
  questions,
  defaultName,
  consentTemplates,
}: {
  token: string;
  questions: CounselingQuestion[];
  defaultName: string;
  consentTemplates: ConsentTemplate[];
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState<"form" | "consent">("form");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (label: string, value: string) =>
    setAnswers((a) => ({ ...a, [label]: value }));

  const matched = matchedConsentTemplates(answers, consentTemplates);

  function submit(consents: ConsentSignature[]) {
    startTransition(async () => {
      const res =
        consents.length > 0
          ? await submitCounselingWithConsents(token, answers, consents)
          : await submitCounseling(token, answers);
      if (res.ok) setDone(true);
      else setError(res.message ?? "送信に失敗しました");
    });
  }

  function handleNext() {
    setError(null);
    if (hasUncheckedAck(questions, answers)) {
      setError("注意事項の「確認しました」にすべてチェックを入れてください");
      return;
    }
    if (matched.length > 0) {
      setStep("consent");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      submit([]);
    }
  }

  if (done) {
    return (
      <div className="noble-card gold-hairline p-6 text-center space-y-2 fade-in">
        <p className="text-gold text-xs" aria-hidden>◆</p>
        <p className="serif text-xl text-ink">送信が完了しました</p>
        <p className="text-sm text-muted">ご協力ありがとうございました。ご来店をお待ちしております。</p>
      </div>
    );
  }

  if (step === "consent") {
    return (
      <>
        <ConsentStep
          templates={matched}
          defaultName={defaultName}
          pending={pending}
          onBack={() => setStep("form")}
          onComplete={submit}
        />
        {error && (
          <p className="mt-3 text-sm text-caution bg-caution-soft rounded-lg px-3 py-2">{error}</p>
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <CounselingFields questions={questions} answers={answers} onChange={set} />

      {error && (
        <p className="text-sm text-caution bg-caution-soft rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={handleNext}
        className="w-full min-h-12 rounded-full bg-gold text-white text-sm font-semibold hover:bg-gold-dk transition-colors disabled:opacity-50 shadow-[0_2px_8px_rgba(184,155,94,0.35)]"
      >
        {pending ? "送信中…" : matched.length > 0 ? "同意書の確認・署名へ進む" : "この内容で送信する"}
      </button>
    </div>
  );
}
