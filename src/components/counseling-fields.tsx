"use client";

import type { CounselingQuestion } from "@/lib/types";
import {
  CheckIcon,
  FORM_INPUT_CLASS,
  FORM_TEXTAREA_CLASS,
  RequiredBadge,
} from "@/components/public-form-ui";

// 注意事項（ack）を確認したときに保存する値
const ACK_VALUE = "確認済み";

// 自由記入欄の例文（任意の質問なので、空欄で送ってよいことを伝える）
const FREE_TEXT_HINT = "特にない場合は空欄のままで大丈夫です";

/** 質問カードの DOM id（未確認の注意事項までスクロールするときに使う） */
export function questionDomId(questionId: number): string {
  return `cq-${questionId}`;
}

function isAnswered(q: CounselingQuestion, value: string | undefined): boolean {
  if (q.field_type === "ack") return value === ACK_VALUE;
  return (value ?? "").trim() !== "";
}

// お客様向けカウンセリングの質問描画（受付フォーム・トークンフォーム共通）
// チップタップ中心・キーボード入力を最小化
export function CounselingFields({
  questions,
  answers,
  onChange,
  showErrors = false,
}: {
  questions: CounselingQuestion[];
  answers: Record<string, string>;
  onChange: (label: string, value: string) => void;
  /** 送信を試みた後は、未確認の注意事項を赤枠で示す */
  showErrors?: boolean;
}) {
  const toggleMulti = (label: string, option: string) => {
    const current = answers[label] ? answers[label].split(",") : [];
    const next = current.includes(option)
      ? current.filter((o) => o !== option)
      : [...current, option];
    onChange(label, next.join(","));
  };

  // 質問番号（注意事項の確認カードは数えない）
  const numbers = new Map<number, number>();
  questions
    .filter((q) => q.field_type !== "ack")
    .forEach((q, i) => numbers.set(q.id, i + 1));

  return (
    <>
      {questions.map((q) => {
        const value = answers[q.label];
        const answered = isAnswered(q, value);
        const domId = questionDomId(q.id);
        const titleId = `${domId}-title`;

        // 注意事項: 本文＋「確認しました」チェック（送信に必須）
        if (q.field_type === "ack") {
          const invalid = showErrors && !answered;
          return (
            <div
              key={q.id}
              id={domId}
              role="group"
              aria-labelledby={titleId}
              data-state={invalid ? "invalid" : answered ? "done" : undefined}
              className="noble-card gold-hairline space-y-3 p-4 transition-[border-color,box-shadow] duration-150"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold tracking-wider text-gold-dk">ご確認ください</p>
                <RequiredBadge />
              </div>
              <h2 id={titleId} className="text-sm font-semibold leading-relaxed text-ink">
                {q.label}
              </h2>
              <p className="whitespace-pre-wrap rounded-lg border border-hairline bg-base p-3.5 text-sm leading-relaxed text-ink">
                {q.options}
              </p>
              <AckCheck
                checked={answered}
                invalid={invalid}
                onToggle={() => onChange(q.label, answered ? "" : ACK_VALUE)}
              />
              {invalid && (
                <p className="text-xs font-medium text-caution">
                  内容をご確認のうえ、チェックを入れてください
                </p>
              )}
            </div>
          );
        }

        const no = numbers.get(q.id) ?? 0;
        const inputId = `${domId}-input`;
        const isFreeText = q.field_type === "text" || q.field_type === "textarea";

        return (
          <div
            key={q.id}
            id={domId}
            role="group"
            aria-labelledby={titleId}
            className="noble-card gold-hairline space-y-3 p-4"
          >
            <div className="flex items-start gap-2.5">
              <QuestionNo no={no} answered={answered} />
              <h2 id={titleId} className="min-w-0 flex-1 pt-px text-sm font-semibold leading-relaxed text-ink">
                {isFreeText ? <label htmlFor={inputId}>{q.label}</label> : q.label}
              </h2>
            </div>

            {q.field_type === "multi" && (
              <p className="-mt-1.5 pl-[34px] text-xs text-muted">複数選択できます</p>
            )}

            {q.field_type === "text" && (
              <input
                id={inputId}
                type="text"
                value={value ?? ""}
                onChange={(e) => onChange(q.label, e.target.value)}
                placeholder={FREE_TEXT_HINT}
                className={FORM_INPUT_CLASS}
              />
            )}

            {q.field_type === "textarea" && (
              <textarea
                id={inputId}
                rows={3}
                value={value ?? ""}
                onChange={(e) => onChange(q.label, e.target.value)}
                placeholder={FREE_TEXT_HINT}
                className={FORM_TEXTAREA_CLASS}
              />
            )}

            {q.field_type === "yes_no" && (
              <div className="flex flex-wrap gap-2">
                {["はい", "いいえ"].map((o) => (
                  <FormChip
                    key={o}
                    label={o}
                    selected={value === o}
                    onClick={() => onChange(q.label, o)}
                  />
                ))}
              </div>
            )}

            {q.field_type === "choice" && (
              <div className="flex flex-wrap gap-2">
                {(q.options ?? "").split(",").filter(Boolean).map((o) => (
                  <FormChip
                    key={o}
                    label={o}
                    selected={value === o}
                    onClick={() => onChange(q.label, o)}
                  />
                ))}
              </div>
            )}

            {q.field_type === "multi" && (
              <div className="flex flex-wrap gap-2">
                {(q.options ?? "").split(",").filter(Boolean).map((o) => (
                  <FormChip
                    key={o}
                    label={o}
                    selected={(value ?? "").split(",").includes(o)}
                    onClick={() => toggleMulti(q.label, o)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

// 質問番号。回答すると ✓ に変わり、どこまで答えたかが一目で分かる
function QuestionNo({ no, answered }: { no: number; answered: boolean }) {
  return (
    <span
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tnum transition-colors ${
        answered ? "bg-gold text-white" : "border border-gold/40 bg-gold-soft/60 text-gold-dk"
      }`}
    >
      {answered ? <CheckIcon /> : <span aria-hidden>{no}</span>}
      <span className="sr-only">{answered ? `質問${no}（回答済み）` : `質問${no}`}</span>
    </span>
  );
}

// 注意事項の「内容を確認しました」（チェックボックスとして読み上げ）
function AckCheck({
  checked,
  invalid,
  onToggle,
}: {
  checked: boolean;
  invalid: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={`flex min-h-12 w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-left text-sm transition-colors ${
        checked
          ? "border-gold bg-gold-soft font-semibold text-gold-dk"
          : invalid
            ? "border-caution bg-surface text-ink"
            : "border-hairline bg-surface text-ink hover:border-gold/60"
      }`}
    >
      <span
        aria-hidden
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
          checked
            ? "border-gold bg-gold text-white"
            : invalid
              ? "border-caution bg-surface"
              : "border-muted/50 bg-surface"
        }`}
      >
        {checked && <CheckIcon />}
      </span>
      内容を確認しました
    </button>
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
      className={`min-h-11 max-w-full rounded-full border px-4 py-2 text-left text-sm leading-snug transition-[background-color,border-color,color,transform] duration-150 motion-safe:active:scale-[0.97] ${
        selected
          ? "border-gold bg-gold-soft font-semibold text-gold-dk shadow-[inset_0_0_0_1px_var(--noble-gold)]"
          : "border-hairline bg-surface text-ink hover:border-gold/60"
      }`}
    >
      {selected && (
        <span className="mr-1 text-[9px] text-gold" aria-hidden>◆</span>
      )}
      {label}
    </button>
  );
}

/** まだ「確認しました」にチェックが入っていない注意事項（画面の並び順）。
    1件でもあれば送信できない（送信前バリデーション用） */
export function uncheckedAcks(
  questions: CounselingQuestion[],
  answers: Record<string, string>
): CounselingQuestion[] {
  return questions.filter(
    (q) => q.field_type === "ack" && answers[q.label] !== ACK_VALUE
  );
}
