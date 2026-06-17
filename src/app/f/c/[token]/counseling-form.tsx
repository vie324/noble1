"use client";

import { useState, useTransition } from "react";
import { submitCounseling } from "../../actions";
import { CounselingFields, hasUncheckedAck } from "@/components/counseling-fields";
import type { CounselingQuestion } from "@/lib/types";

// 特定のお客様あてに発行したトークン付きフォーム
export function CounselingForm({
  token,
  questions,
}: {
  token: string;
  questions: CounselingQuestion[];
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (label: string, value: string) =>
    setAnswers((a) => ({ ...a, [label]: value }));

  function handleSubmit() {
    setError(null);
    if (hasUncheckedAck(questions, answers)) {
      setError("注意事項の「確認しました」にすべてチェックを入れてください");
      return;
    }
    startTransition(async () => {
      const res = await submitCounseling(token, answers);
      if (res.ok) setDone(true);
      else setError(res.message ?? "送信に失敗しました");
    });
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

  return (
    <div className="space-y-4">
      <CounselingFields questions={questions} answers={answers} onChange={set} />

      {error && (
        <p className="text-sm text-caution bg-caution-soft rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={handleSubmit}
        className="w-full min-h-12 rounded-full bg-gold text-white text-sm font-semibold hover:bg-gold-dk transition-colors disabled:opacity-50 shadow-[0_2px_8px_rgba(184,155,94,0.35)]"
      >
        {pending ? "送信中…" : "この内容で送信する"}
      </button>
    </div>
  );
}
