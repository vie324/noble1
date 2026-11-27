"use client";

import { useState, useTransition } from "react";
import { submitCounseling, submitCounselingWithConsents, type ConsentSignature } from "../../actions";
import { CounselingFields, questionDomId, uncheckedAcks } from "@/components/counseling-fields";
import { ConsentStep, matchedConsentTemplates } from "@/components/consent-step";
import {
  FormAlert,
  FormComplete,
  FormSteps,
  revealField,
  SubmitHint,
} from "@/components/public-form-ui";
import type { ConsentTemplate, CounselingQuestion } from "@/lib/types";

const STEPS = ["ご記入", "同意書・ご署名"];

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
  const [showErrors, setShowErrors] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = (label: string, value: string) =>
    setAnswers((a) => ({ ...a, [label]: value }));

  const matched = matchedConsentTemplates(answers, consentTemplates);
  const pendingAcks = uncheckedAcks(questions, answers);
  const hasRequired = questions.some((q) => q.field_type === "ack");

  // 送信を試みた後だけ、足りない項目をボタンの上に示す（直したら消える）
  const validationMessage =
    showErrors && pendingAcks.length > 0
      ? "注意事項の「確認しました」にすべてチェックを入れてください"
      : null;
  const alertMessage = error ?? validationMessage;

  function submit(consents: ConsentSignature[]) {
    startTransition(async () => {
      const res =
        consents.length > 0
          ? await submitCounselingWithConsents(token, answers, consents)
          : await submitCounseling(token, answers);
      if (res.ok) {
        setDone(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setError(res.message ?? "送信に失敗しました");
      }
    });
  }

  function handleNext() {
    setError(null);
    if (pendingAcks.length > 0) {
      setShowErrors(true);
      revealField(questionDomId(pendingAcks[0].id));
      return;
    }
    if (matched.length > 0) {
      setStep("consent");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      submit([]);
    }
  }

  // 同意書から戻ったら、押したボタンのあたりに戻す
  function backToForm() {
    setError(null);
    setStep("form");
    requestAnimationFrame(() =>
      document.getElementById("counseling-submit")?.scrollIntoView({ block: "center" })
    );
  }

  if (done) {
    return (
      <FormComplete title="送信が完了しました">
        ご協力ありがとうございました。
        <br />
        ご来店をお待ちしております。
      </FormComplete>
    );
  }

  if (step === "consent") {
    return (
      <div className="space-y-4">
        <FormSteps steps={STEPS} current={2} />
        <ConsentStep
          templates={matched}
          defaultName={defaultName}
          pending={pending}
          onBack={backToForm}
          onComplete={submit}
        />
        {error && <FormAlert>{error}</FormAlert>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {matched.length > 0 && <FormSteps steps={STEPS} current={1} />}

      <CounselingFields
        questions={questions}
        answers={answers}
        onChange={set}
        showErrors={showErrors}
      />

      <div className="space-y-3 pt-2">
        {alertMessage ? (
          <FormAlert>{alertMessage}</FormAlert>
        ) : (
          hasRequired && <SubmitHint remaining={pendingAcks.length} />
        )}
        <button
          id="counseling-submit"
          type="button"
          disabled={pending}
          onClick={handleNext}
          className="w-full min-h-12 rounded-full bg-gold text-sm font-semibold text-white shadow-[0_2px_8px_rgba(184,155,94,0.35)] transition-colors hover:bg-gold-dk disabled:opacity-50"
        >
          {pending ? "送信中…" : matched.length > 0 ? "同意書の確認・署名へ進む" : "この内容で送信する"}
        </button>
        <p className="text-center text-[11px] leading-relaxed text-muted">
          ご入力いただいた情報は、施術のご案内とカルテ管理にのみ使用します。
        </p>
      </div>
    </div>
  );
}
