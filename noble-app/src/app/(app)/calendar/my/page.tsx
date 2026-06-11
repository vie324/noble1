"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { Badge, Button, Card, Chip, ListSkeleton, SectionTitle } from "@/components/ui";
import { ShiftTabs } from "@/components/shift-tabs";
import { MonthNav } from "@/components/admin-tabs";
import {
  addMonths,
  dateLabelJa,
  monthLabelJa,
  thisMonthJST,
  timeShort,
  timeToMinutes,
  todayJST,
  WEEKDAYS_JA,
} from "@/lib/format";
import { REQUEST_TYPE_META } from "@/lib/types";
import type {
  AttendanceRecord,
  RequestType,
  Shift,
  ShiftRecruitment,
  ShiftRequest,
} from "@/lib/types";

// スタッフ本人用: 希望提出 / 確定シフト確認 / 勤務実績
export default function MyShiftPage() {
  const { me, storeName } = useApp();
  const supabase = useMemo(() => createClient(), []);

  const [recruitment, setRecruitment] = useState<ShiftRecruitment | null>(null);
  const [requests, setRequests] = useState<Map<string, ShiftRequest>>(new Map());
  const [month, setMonth] = useState(thisMonthJST());
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [attendance, setAttendance] = useState<Map<number, AttendanceRecord>>(new Map());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setShifts(null);
    const [rec, sh] = await Promise.all([
      supabase
        .from("shift_recruitments")
        .select("*")
        .eq("status", "open")
        .order("month")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("shifts")
        .select("*")
        .eq("staff_id", me.id)
        .eq("status", "confirmed")
        .gte("date", month)
        .lt("date", addMonths(month, 1))
        .order("date"),
    ]);

    const recruitmentRow = (rec.data as ShiftRecruitment) ?? null;
    setRecruitment(recruitmentRow);

    const shiftRows = (sh.data as Shift[]) ?? [];
    setShifts(shiftRows);

    if (recruitmentRow) {
      const { data: reqs } = await supabase
        .from("shift_requests")
        .select("*")
        .eq("staff_id", me.id)
        .eq("month", recruitmentRow.month);
      setRequests(new Map(((reqs as ShiftRequest[]) ?? []).map((r) => [r.date, r])));
    }

    if (shiftRows.length > 0) {
      const { data: att } = await supabase
        .from("attendance_records")
        .select("*")
        .in(
          "shift_id",
          shiftRows.map((s) => s.id)
        );
      setAttendance(new Map(((att as AttendanceRecord[]) ?? []).map((a) => [a.shift_id, a])));
    } else {
      setAttendance(new Map());
    }
  }, [supabase, me.id, month]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5 fade-in">
      <ShiftTabs />
      <div>
        <h1 className="serif text-3xl text-ink">マイシフト</h1>
        <p className="text-sm text-muted mt-1">
          {me.icon_emoji} {me.name} ・ 主所属 {storeName(me.store_id)}
        </p>
      </div>

      {/* 希望提出（募集中の月があるときだけ表示） */}
      {recruitment && (
        <RequestSection
          recruitment={recruitment}
          requests={requests}
          staffId={me.id}
          onChanged={load}
        />
      )}

      {/* 確定シフト */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <SectionTitle className="flex-1">確定シフト（{monthLabelJa(month)}）</SectionTitle>
          <MonthNav month={month} onChange={setMonth} />
        </div>

        {shifts === null ? (
          <ListSkeleton rows={4} />
        ) : shifts.length === 0 ? (
          <p className="text-sm text-muted">この月の確定シフトはありません</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {shifts.map((s) => (
              <ShiftRow
                key={s.id}
                shift={s}
                attendance={attendance.get(s.id)}
                busy={busy}
                setBusy={setBusy}
                onChanged={load}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ================= 希望提出 ================= */
function RequestSection({
  recruitment,
  requests,
  staffId,
  onChanged,
}: {
  recruitment: ShiftRecruitment;
  requests: Map<string, ShiftRequest>;
  staffId: number;
  onChanged: () => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [timeEditDate, setTimeEditDate] = useState<string | null>(null);
  const [timeDraft, setTimeDraft] = useState({ start: "10:00", end: "19:00" });

  const days = useMemo(() => {
    const [y, m] = recruitment.month.split("-").map(Number);
    const count = new Date(y, m, 0).getDate();
    return Array.from(
      { length: count },
      (_, i) => `${recruitment.month.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`
    );
  }, [recruitment.month]);

  async function setType(date: string, type: RequestType, start?: string, end?: string) {
    setBusy(true);
    await supabase.from("shift_requests").upsert(
      {
        staff_id: staffId,
        month: recruitment.month,
        date,
        type,
        start_time: type === "time" ? (start ?? null) : null,
        end_time: type === "time" ? (end ?? null) : null,
      },
      { onConflict: "staff_id,date" }
    );
    await onChanged();
    setBusy(false);
    setTimeEditDate(null);
  }

  // クイック入力: 未入力の日をすべて「いつも通り」で埋める
  async function fillUsual() {
    setBusy(true);
    const blanks = days.filter((d) => !requests.has(d));
    if (blanks.length > 0) {
      await supabase.from("shift_requests").upsert(
        blanks.map((date) => ({
          staff_id: staffId,
          month: recruitment.month,
          date,
          type: "usual" as const,
        })),
        { onConflict: "staff_id,date" }
      );
    }
    await onChanged();
    setBusy(false);
  }

  const submitted = days.filter((d) => requests.has(d)).length;

  return (
    <Card className="p-4 space-y-3 border-gold/50">
      <SectionTitle>
        シフト希望の提出（{monthLabelJa(recruitment.month)}・受付中）
      </SectionTitle>
      {recruitment.note && <p className="text-sm text-warn font-medium">📣 {recruitment.note}</p>}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted tnum">
          {submitted}/{days.length} 日 入力済み
        </p>
        <Button variant="secondary" disabled={busy} onClick={fillUsual}>
          残りすべて「いつも通り」にする
        </Button>
      </div>

      <ul className="divide-y divide-hairline">
        {days.map((date) => {
          const req = requests.get(date);
          const weekday = new Date(`${date}T12:00:00+09:00`).getUTCDay();
          return (
            <li key={date} className="py-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`w-16 shrink-0 text-sm tnum ${
                    weekday === 0 ? "text-rose" : weekday === 6 ? "text-gold-dk" : "text-ink"
                  }`}
                >
                  {Number(date.slice(8))}日({WEEKDAYS_JA[weekday]})
                </span>
                <div className="flex gap-1.5 flex-wrap">
                  {(Object.keys(REQUEST_TYPE_META) as RequestType[]).map((t) => (
                    <Chip
                      key={t}
                      label={
                        t === "time" && req?.type === "time" && req.start_time
                          ? `${timeShort(req.start_time)}〜${timeShort(req.end_time ?? "")}`
                          : REQUEST_TYPE_META[t].label
                      }
                      selected={req?.type === t}
                      disabled={busy}
                      onClick={() => {
                        if (t === "time") {
                          setTimeEditDate(timeEditDate === date ? null : date);
                        } else {
                          setType(date, t);
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
              {timeEditDate === date && (
                <div className="flex items-center gap-2 mt-2 pl-16 fade-in">
                  <input
                    type="time"
                    value={timeDraft.start}
                    onChange={(e) => setTimeDraft({ ...timeDraft, start: e.target.value })}
                    className="min-h-10 rounded-lg border border-hairline bg-surface px-2 text-sm outline-none focus:border-gold"
                    aria-label="開始時刻"
                  />
                  <span className="text-muted">〜</span>
                  <input
                    type="time"
                    value={timeDraft.end}
                    onChange={(e) => setTimeDraft({ ...timeDraft, end: e.target.value })}
                    className="min-h-10 rounded-lg border border-hairline bg-surface px-2 text-sm outline-none focus:border-gold"
                    aria-label="終了時刻"
                  />
                  <Button
                    disabled={busy}
                    onClick={() => setType(date, "time", timeDraft.start, timeDraft.end)}
                  >
                    確定
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ================= 確定シフト1行（確認チェック＋実績入力） ================= */
function ShiftRow({
  shift,
  attendance,
  busy,
  setBusy,
  onChanged,
}: {
  shift: Shift;
  attendance?: AttendanceRecord;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onChanged: () => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { storeName } = useApp();
  const [editing, setEditing] = useState(false);
  const [actual, setActual] = useState({
    start: attendance?.actual_start?.slice(0, 5) ?? shift.start_time.slice(0, 5),
    end: attendance?.actual_end?.slice(0, 5) ?? shift.end_time.slice(0, 5),
    reason: attendance?.diff_reason ?? "",
  });
  const [error, setError] = useState<string | null>(null);

  const isPast = shift.date <= todayJST();
  const planned = `${timeShort(shift.start_time)}〜${timeShort(shift.end_time)}`;

  async function acknowledge() {
    setBusy(true);
    await supabase.rpc("acknowledge_shift", { p_shift_id: shift.id });
    await onChanged();
    setBusy(false);
  }

  async function saveAttendance() {
    // 予定とずれているのに理由が空ならガード（理由付き記録の徹底）
    const diff =
      timeToMinutes(actual.start) !== timeToMinutes(shift.start_time) ||
      timeToMinutes(actual.end) !== timeToMinutes(shift.end_time);
    if (diff && !actual.reason.trim()) {
      setError("予定と実働がずれている場合は理由を入力してください");
      return;
    }
    setError(null);
    setBusy(true);
    await supabase.from("attendance_records").upsert(
      {
        shift_id: shift.id,
        actual_start: actual.start,
        actual_end: actual.end,
        diff_reason: actual.reason.trim() || null,
      },
      { onConflict: "shift_id" }
    );
    setEditing(false);
    await onChanged();
    setBusy(false);
  }

  return (
    <li className="py-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="w-24 shrink-0 text-sm text-ink tnum">{dateLabelJa(shift.date)}</span>
        <span className="text-sm text-ink tnum">{planned}</span>
        <span className="text-xs text-muted">{storeName(shift.store_id)}</span>
        <span className="flex-1" />
        {attendance && (
          <Badge color={attendance.diff_reason ? "warn" : "ok"}>
            実績 {timeShort(attendance.actual_start)}〜{timeShort(attendance.actual_end)}
          </Badge>
        )}
        {shift.acknowledged_at ? (
          <Badge color="ok">確認済み</Badge>
        ) : (
          <Button variant="secondary" disabled={busy} onClick={acknowledge}>
            確認しました
          </Button>
        )}
        {isPast && (
          <Button variant="ghost" disabled={busy} onClick={() => setEditing(!editing)}>
            {attendance ? "実績を修正" : "実績を記録"}
          </Button>
        )}
      </div>
      {attendance?.diff_reason && (
        <p className="text-xs text-warn mt-1 pl-24">理由: {attendance.diff_reason}</p>
      )}
      {editing && (
        <div className="mt-2 rounded-xl border border-hairline bg-base p-3 space-y-2 fade-in">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="time"
              value={actual.start}
              onChange={(e) => setActual({ ...actual, start: e.target.value })}
              className="min-h-10 rounded-lg border border-hairline bg-surface px-2 text-sm outline-none focus:border-gold"
              aria-label="実開始"
            />
            <span className="text-muted">〜</span>
            <input
              type="time"
              value={actual.end}
              onChange={(e) => setActual({ ...actual, end: e.target.value })}
              className="min-h-10 rounded-lg border border-hairline bg-surface px-2 text-sm outline-none focus:border-gold"
              aria-label="実終了"
            />
            <input
              type="text"
              value={actual.reason}
              onChange={(e) => setActual({ ...actual, reason: e.target.value })}
              placeholder="ずれた場合の理由（残業・早退など）"
              className="flex-1 min-w-40 min-h-10 rounded-lg border border-hairline bg-surface px-2 text-sm outline-none focus:border-gold"
              aria-label="理由"
            />
            <Button disabled={busy} onClick={saveAttendance}>
              保存
            </Button>
          </div>
          {error && <p className="text-xs text-caution">{error}</p>}
        </div>
      )}
    </li>
  );
}
