"use client";

import { useState, useTransition } from "react";
import { submitIntake, submitIntakeWithConsents, type ConsentSignature } from "../actions";
import {
  CounselingFields,
  FormChip,
  questionDomId,
  uncheckedAcks,
} from "@/components/counseling-fields";
import { ConsentStep, matchedConsentTemplates } from "@/components/consent-step";
import {
  FieldError,
  FieldLabel,
  FORM_INPUT_CLASS,
  FormAlert,
  FormComplete,
  FormSteps,
  revealField,
  SubmitHint,
} from "@/components/public-form-ui";
import type { ConsentTemplate, CounselingQuestion, Store } from "@/lib/types";

const STEPS = ["ご記入", "同意書・ご署名"];

// 受付フォーム本体（お客様が本人情報＋カウンセリングを入力 → 同意書署名）
export function IntakeForm({
  questions,
  stores,
  consentTemplates,
}: {
  questions: CounselingQuestion[];
  stores: Store[];
  consentTemplates: ConsentTemplate[];
}) {
  const [name, setName] = useState("");
  const [kana, setKana] = useState("");
  const [phone, setPhone] = useState("");
  const [storeId, setStoreId] = useState<number | null>(null);
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
  const remaining = (name.trim() ? 0 : 1) + pendingAcks.length;
  const nameInvalid = showErrors && !name.trim();

  // 送信を試みた後だけ、足りない項目をボタンの上に示す（直したら消える）
  const validationMessage = !showErrors
    ? null
    : !name.trim()
      ? "お名前を入力してください"
      : pendingAcks.length > 0
        ? "注意事項の「確認しました」にすべてチェックを入れてください"
        : null;
  const alertMessage = error ?? validationMessage;

  function submit(consents: ConsentSignature[]) {
    startTransition(async () => {
      const res =
        consents.length > 0
          ? await submitIntakeWithConsents({ name, kana, phone, storeId, answers }, consents)
          : await submitIntake({ name, kana, phone, storeId, answers });
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
    if (!name.trim()) {
      setShowErrors(true);
      revealField("applicant-name");
      return;
    }
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
      document.getElementById("intake-submit")?.scrollIntoView({ block: "center" })
    );
  }

  if (done) {
    return (
      <FormComplete title="送信が完了しました">
        ご記入ありがとうございました。
        <br />
        <span className="inline-block">当日はスタッフが内容を確認のうえ</span>
        <span className="inline-block">ご案内いたします。</span>
      </FormComplete>
    );
  }

  if (step === "consent") {
    return (
      <div className="space-y-4">
        <FormSteps steps={STEPS} current={2} />
        <ConsentStep
          templates={matched}
          defaultName={name}
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

      {/* 本人情報 */}
      <div
        role="group"
        aria-labelledby="applicant-title"
        className="noble-card gold-hairline space-y-4 p-4"
      >
        <h2 id="applicant-title" className="text-sm font-semibold text-ink">
          お客様情報
        </h2>
        <div>
          <FieldLabel htmlFor="applicant-name" required>
            お名前
          </FieldLabel>
          <input
            id="applicant-name"
            type="text"
            autoComplete="name"
            placeholder="例）山田 花子"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={nameInvalid || undefined}
            aria-describedby={nameInvalid ? "applicant-name-error" : undefined}
            className={FORM_INPUT_CLASS}
          />
          {nameInvalid && (
            <FieldError id="applicant-name-error">お名前をご入力ください</FieldError>
          )}
        </div>
        <div>
          <FieldLabel htmlFor="applicant-kana">フリガナ</FieldLabel>
          <input
            id="applicant-kana"
            type="text"
            placeholder="例）ヤマダ ハナコ"
            value={kana}
            onChange={(e) => setKana(e.target.value)}
            className={FORM_INPUT_CLASS}
          />
        </div>
        <div>
          <FieldLabel htmlFor="applicant-phone">お電話番号</FieldLabel>
          <input
            id="applicant-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={FORM_INPUT_CLASS}
          />
        </div>
        {stores.length > 1 && (
          <div role="group" aria-labelledby="applicant-store">
            <span id="applicant-store" className="mb-1.5 block text-xs font-semibold text-muted">
              ご来店店舗
            </span>
            <div className="flex flex-wrap gap-2">
              {stores.map((s) => (
                <FormChip
                  key={s.id}
                  label={s.name}
                  selected={storeId === s.id}
                  onClick={() => setStoreId(storeId === s.id ? null : s.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <CounselingFields
        questions={questions}
        answers={answers}
        onChange={set}
        showErrors={showErrors}
      />

      <div className="space-y-3 pt-2">
        {alertMessage ? <FormAlert>{alertMessage}</FormAlert> : <SubmitHint remaining={remaining} />}
        <button
          id="intake-submit"
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
