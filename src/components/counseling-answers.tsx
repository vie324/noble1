"use client";

import { Badge } from "@/components/ui";

// カウンセリング回答を見やすく表示（カルテ画面・受付箱で共通）
// ・複数選択（カンマ区切り）はチップ表示
// ・注意事項（"確認済み"）は緑バッジ
// ・「ある」「妊娠中」など注意が必要な回答は色を付けて目立たせる
const ALERT_VALUES = new Set([
  "ある",
  "はい",
  "妊娠中",
  "妊娠の可能性がある",
  "授乳中",
]);

export function CounselingAnswers({
  answers,
}: {
  answers: Record<string, string>;
}) {
  const entries = Object.entries(answers).filter(([, v]) => v !== "" && v != null);
  if (entries.length === 0) {
    return <p className="text-sm text-muted">回答がありません</p>;
  }

  return (
    <dl className="space-y-3">
      {entries.map(([q, a]) => (
        <div key={q} className="grid grid-cols-1 sm:grid-cols-[minmax(0,38%)_1fr] gap-1 sm:gap-3">
          <dt className="text-xs text-muted leading-snug">{q.replace(/^【|】$/g, "")}</dt>
          <dd className="text-sm text-ink">
            {a === "確認済み" ? (
              <Badge color="ok">確認済み</Badge>
            ) : a.includes(",") ? (
              <span className="flex flex-wrap gap-1">
                {a.split(",").map((v) => (
                  <span
                    key={v}
                    className="inline-block rounded-full border border-hairline bg-base px-2 py-0.5 text-xs"
                  >
                    {v}
                  </span>
                ))}
              </span>
            ) : ALERT_VALUES.has(a.trim()) ? (
              <span className="font-semibold text-warn">{a}</span>
            ) : (
              <span className="whitespace-pre-wrap">{a}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
