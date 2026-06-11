"use client";

import { useState, useTransition } from "react";
import { submitCounseling } from "../../actions";
import type { CounselingQuestion } from "@/lib/types";

// チップタップ中心・キーボード入力最小のお客様向けフォーム
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

  const toggleMulti = (label: string, option: string) => {
    const current = answers[label] ? answers[label].split(",") : [];
    const next = current.includes(option)
      ? current.filter((o) => o !== option)
      : [...current, option];
    set(label, next.join(","));
  };

  function handleSubmit() {
    setError(null);
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
      {questions.map((q) => (
        <div key={q.id} className="noble-card gold-hairline p-4 space-y-2.5">
          <p className="text-sm font-semibold text-ink">{q.label}</p>

          {q.field_type === "text" && (
            <input
              type="text"
              value={answers[q.label] ?? ""}
              onChange={(e) => set(q.label, e.target.value)}
              className="w-full min-h-11 rounded-lg border border-hairline bg-surface px-3 text-base outline-none focus:border-gold"
            />
          )}

          {q.field_type === "textarea" && (
            <textarea
              rows={3}
              value={answers[q.label] ?? ""}
              onChange={(e) => set(q.label, e.target.value)}
              className="w-full rounded-lg border border-hairline bg-surface px-3 py-2.5 text-base outline-none focus:border-gold"
            />
          )}

          {q.field_type === "yes_no" && (
            <div className="flex gap-2">
              {["はい", "いいえ"].map((o) => (
                <FormChip
                  key={o}
                  label={o}
                  selected={answers[q.label] === o}
                  onClick={() => set(q.label, o)}
                />
              ))}
            </div>
          )}

          {q.field_type === "choice" && (
            <div className="flex gap-2 flex-wrap">
              {(q.options ?? "").split(",").filter(Boolean).map((o) => (
                <FormChip
                  key={o}
                  label={o}
                  selected={answers[q.label] === o}
                  onClick={() => set(q.label, o)}
                />
              ))}
            </div>
          )}

          {q.field_type === "multi" && (
            <div className="flex gap-2 flex-wrap">
              {(q.options ?? "").split(",").filter(Boolean).map((o) => (
                <FormChip
                  key={o}
                  label={o}
                  selected={(answers[q.label] ?? "").split(",").includes(o)}
                  onClick={() => toggleMulti(q.label, o)}
                />
              ))}
            </div>
          )}
        </div>
      ))}

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

function FormChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-h-11 px-4 rounded-full border text-sm transition-colors ${
        selected
          ? "border-gold bg-gold-soft text-gold-dk font-semibold shadow-[inset_0_0_0_1px_var(--noble-gold)]"
          : "border-hairline bg-surface text-ink"
      }`}
    >
      {selected && (
        <span className="mr-1 text-[9px] text-gold" aria-hidden>◆</span>
      )}
      {label}
    </button>
  );
}
