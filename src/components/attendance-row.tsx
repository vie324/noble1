"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Button } from "@/components/ui";
import { timeShort, timeToMinutes, WEEKDAYS_JA } from "@/lib/format";
import type { AttendanceRecord, Shift } from "@/lib/types";

/* 日別実績1行（管理者による記録・修正）。締め済みの月は修正ボタンを出さない */
export function AdminAttendanceRow({
  shift,
  attendance,
  storeName,
  busy,
  setBusy,
  onSaved,
  locked = false,
}: {
  shift: Shift;
  attendance?: AttendanceRecord;
  storeName: (id: number | null | undefined) => string;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onSaved: () => Promise<void>;
  locked?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [editing, setEditing] = useState(false);
  const [actual, setActual] = useState({
    start: attendance?.actual_start?.slice(0, 5) ?? shift.start_time.slice(0, 5),
    end: attendance?.actual_end?.slice(0, 5) ?? shift.end_time.slice(0, 5),
    reason: attendance?.diff_reason ?? "",
  });
  const [error, setError] = useState<string | null>(null);

  const w = new Date(`${shift.date}T12:00:00+09:00`).getUTCDay();
  const dateLabel = `${Number(shift.date.slice(5, 7))}/${Number(shift.date.slice(8))}(${WEEKDAYS_JA[w]})`;

  async function save() {
    // 予定とずれているのに理由が空ならガード（マイシフト側と同じルール）
    const diff =
      timeToMinutes(actual.start) !== timeToMinutes(shift.start_time) ||
      timeToMinutes(actual.end) !== timeToMinutes(shift.end_time);
    if (diff && !actual.reason.trim()) {
      setError("予定と実働がずれている場合は理由を入力してください（残業・早退・変更など）");
      return;
    }
    if (timeToMinutes(actual.end) <= timeToMinutes(actual.start)) {
      setError("終了時刻は開始時刻より後にしてください");
      return;
    }
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.from("attendance_records").upsert(
      {
        shift_id: shift.id,
        actual_start: actual.start,
        actual_end: actual.end,
        diff_reason: actual.reason.trim() || null,
      },
      { onConflict: "shift_id" }
    );
    if (err) {
      setError(err.message.includes("月締め済み") ? err.message : "保存できませんでした");
      setBusy(false);
      return;
    }
    setEditing(false);
    await onSaved();
    setBusy(false);
  }

  return (
    <li className="py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`w-16 shrink-0 text-sm tnum ${
            w === 0 ? "text-rose" : w === 6 ? "text-gold-dk" : "text-ink"
          }`}
        >
          {dateLabel}
        </span>
        <span className="text-sm text-ink tnum">
          {timeShort(shift.start_time)}〜{timeShort(shift.end_time)}
        </span>
        <span className="text-xs text-muted">{storeName(shift.store_id)}</span>
        <span className="flex-1" />
        {attendance ? (
          <Badge color={attendance.diff_reason ? "warn" : "ok"}>
            実績 {timeShort(attendance.actual_start)}〜{timeShort(attendance.actual_end)}
          </Badge>
        ) : (
          <Badge color="rose">未記録</Badge>
        )}
        {!locked && (
          <Button variant="ghost" disabled={busy} onClick={() => setEditing(!editing)}>
            {attendance ? "修正" : "記録"}
          </Button>
        )}
      </div>
      {attendance?.diff_reason && (
        <p className="text-xs text-warn mt-1 pl-16">理由: {attendance.diff_reason}</p>
      )}
      {editing && !locked && (
        <div className="mt-2 rounded-xl border border-hairline bg-surface p-3 space-y-2 fade-in">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="time"
              value={actual.start}
              onChange={(e) => setActual({ ...actual, start: e.target.value })}
              className="min-h-11 rounded-lg border border-hairline bg-surface px-2 text-base outline-none focus:border-gold"
              aria-label="実開始"
            />
            <span className="text-muted">〜</span>
            <input
              type="time"
              value={actual.end}
              onChange={(e) => setActual({ ...actual, end: e.target.value })}
              className="min-h-11 rounded-lg border border-hairline bg-surface px-2 text-base outline-none focus:border-gold"
              aria-label="実終了"
            />
            <input
              type="text"
              value={actual.reason}
              onChange={(e) => setActual({ ...actual, reason: e.target.value })}
              placeholder="ずれた場合の理由（残業・早退・変更など）"
              className="flex-1 min-w-40 min-h-11 rounded-lg border border-hairline bg-surface px-2 text-base outline-none focus:border-gold"
              aria-label="理由"
            />
            <Button disabled={busy} onClick={save}>
              保存
            </Button>
          </div>
          {error && <p className="text-xs text-caution">{error}</p>}
        </div>
      )}
    </li>
  );
}
