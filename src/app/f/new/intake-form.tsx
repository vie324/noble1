"use client";

import { useState, useTransition } from "react";
import { submitIntake, submitIntakeWithConsents, type ConsentSignature } from "../actions";
import { CounselingFields, FormChip, hasUncheckedAck } from "@/components/counseling-fields";
import { ConsentStep, matchedConsentTemplates } from "@/components/consent-step";
import type { ConsentTemplate, CounselingQuestion, Store } from "@/lib/types";

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
  const [pending, startTransition] = useTransition();

  const set = (label: string, value: string) =>
    setAnswers((a) => ({ ...a, [label]: value }));

  const matched = matchedConsentTemplates(answers, consentTemplates);

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
      setError("お名前を入力してください");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
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
        <p className="text-sm text-muted">
          ご記入ありがとうございました。
          <br />
          当日はスタッフが内容を確認のうえご案内いたします。
        </p>
      </div>
    );
  }

  if (step === "consent") {
    return (
      <>
        <ConsentStep
          templates={matched}
          defaultName={name}
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
      {/* 本人情報 */}
      <div className="noble-card gold-hairline p-4 space-y-3">
        <p className="text-sm font-semibold text-ink">お客様情報</p>
        <label className="block">
          <span className="block text-xs font-semibold text-muted mb-1">お名前（必須）</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full min-h-11 rounded-lg border border-hairline bg-surface px-3 text-base outline-none focus:border-gold"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-muted mb-1">フリガナ</span>
          <input
            type="text"
            value={kana}
            onChange={(e) => setKana(e.target.value)}
            className="w-full min-h-11 rounded-lg border border-hairline bg-surface px-3 text-base outline-none focus:border-gold"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-muted mb-1">お電話番号</span>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full min-h-11 rounded-lg border border-hairline bg-surface px-3 text-base outline-none focus:border-gold"
          />
        </label>
        {stores.length > 1 && (
          <div>
            <span className="block text-xs font-semibold text-muted mb-1">ご来店店舗</span>
            <div className="flex gap-2 flex-wrap">
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
      <p className="text-center text-[11px] text-muted">
        ご入力いただいた情報は、施術のご案内とカルテ管理にのみ使用します。
      </p>
    </div>
  );
}
