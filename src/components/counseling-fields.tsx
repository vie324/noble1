"use client";

import type { CounselingQuestion } from "@/lib/types";

// お客様向けカウンセリングの質問描画（受付フォーム・トークンフォーム共通）
// チップタップ中心・キーボード入力を最小化
export function CounselingFields({
  questions,
  answers,
  onChange,
}: {
  questions: CounselingQuestion[];
  answers: Record<string, string>;
  onChange: (label: string, value: string) => void;
}) {
  const toggleMulti = (label: string, option: string) => {
    const current = answers[label] ? answers[label].split(",") : [];
    const next = current.includes(option)
      ? current.filter((o) => o !== option)
      : [...current, option];
    onChange(label, next.join(","));
  };

  return (
    <>
      {questions.map((q) => (
        <div key={q.id} className="noble-card gold-hairline p-4 space-y-2.5">
          <p className="text-sm font-semibold text-ink">{q.label}</p>

          {q.field_type === "text" && (
            <input
              type="text"
              value={answers[q.label] ?? ""}
              onChange={(e) => onChange(q.label, e.target.value)}
              className="w-full min-h-11 rounded-lg border border-hairline bg-surface px-3 text-base outline-none focus:border-gold"
            />
          )}

          {q.field_type === "textarea" && (
            <textarea
              rows={3}
              value={answers[q.label] ?? ""}
              onChange={(e) => onChange(q.label, e.target.value)}
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
                  onClick={() => onChange(q.label, o)}
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
                  onClick={() => onChange(q.label, o)}
                />
              ))}
            </div>
          )}

          {q.field_type === "ack" && (
            <div className="space-y-3">
              <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed rounded-lg bg-base border border-hairline p-3">
                {q.options}
              </p>
              <FormChip
                label="内容を確認しました"
                selected={answers[q.label] === "確認済み"}
                onClick={() =>
                  onChange(q.label, answers[q.label] === "確認済み" ? "" : "確認済み")
                }
              />
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
    </>
  );
}

export function FormChip({
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

// ack（注意事項）が未チェックなら true を返す（送信前バリデーション用）
export function hasUncheckedAck(
  questions: CounselingQuestion[],
  answers: Record<string, string>
): boolean {
  return questions.some(
    (q) => q.field_type === "ack" && answers[q.label] !== "確認済み"
  );
}
