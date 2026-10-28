"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { Badge, Button, Card, Chip, ListSkeleton, SectionTitle } from "@/components/ui";
import { useToast } from "@/components/toast";
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
  WEEKDAYS_JA, staffLabel } from "@/lib/format";
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
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const notify = useToast();

  const load = useCallback(async () => {
    setShifts(null);
    const [rec, sh, closing] = await Promise.all([
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
      // 月締め済みの月は実績を変更できない（029_payroll_close_invoices.sql）
      supabase.from("payroll_closings").select("month").eq("month", month).maybeSingle(),
    ]);
    setClosed(!!closing.data);

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
          {staffLabel(me)} ・ 主所属 {storeName(me.store_id)}
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
          <>
            <ShiftSummary
              shifts={shifts}
              attendance={attendance}
              closed={closed}
              busy={busy}
              onAcknowledgeAll={async (ids) => {
                setBusy(true);
                const results = await Promise.all(
                  ids.map((id) => supabase.rpc("acknowledge_shift", { p_shift_id: id }))
                );
                if (results.some((r) => r.error)) notify("確認できなかったシフトがあります", "error");
                else notify(`${ids.length}件のシフトを確認しました`);
                await load();
                setBusy(false);
              }}
            />
            <ul className="divide-y divide-hairline">
              {shifts.map((s) => (
                <ShiftRow
                  key={s.id}
                  shift={s}
                  attendance={attendance.get(s.id)}
                  locked={closed}
                  busy={busy}
                  setBusy={setBusy}
                  onChanged={load}
                />
              ))}
            </ul>
          </>
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
      {recruitment.note && <p className="text-sm text-warn font-medium">{recruitment.note}</p>}
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

/* ================= 月の集計（出勤日数・未確認・実績の記録漏れ） ================= */
function ShiftSummary({
  shifts,
  attendance,
  closed,
  busy,
  onAcknowledgeAll,
}: {
  shifts: Shift[];
  attendance: Map<number, AttendanceRecord>;
  closed: boolean;
  busy: boolean;
  onAcknowledgeAll: (ids: number[]) => Promise<void>;
}) {
  const today = todayJST();
  const unacked = shifts.filter((s) => !s.acknowledged_at);
  const unrecorded = shifts.filter((s) => s.date <= today && !attendance.has(s.id));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2 text-center">
        <SummaryTile label="出勤予定" value={`${shifts.length}日`} />
        <SummaryTile label="未確認" value={`${unacked.length}件`} tone={unacked.length > 0 ? "warn" : "ok"} />
        <SummaryTile
          label="実績の記録漏れ"
          value={`${unrecorded.length}日`}
          tone={unrecorded.length > 0 && !closed ? "warn" : "ok"}
        />
      </div>
      {closed ? (
        <p className="rounded-xl bg-base border border-hairline px-3 py-2 text-xs text-muted">
          🔒 この月は締め済みです。実績の修正が必要なときは管理者に連絡してください
        </p>
      ) : (
        unrecorded.length > 0 && (
          <p className="text-xs text-warn">
            勤務が終わった日は「予定どおり」か「時間を入力」で実績を記録してください（給与計算に使われます）
          </p>
        )
      )}
      {unacked.length > 1 && (
        <Button
          variant="secondary"
          className="w-full"
          disabled={busy}
          onClick={() => onAcknowledgeAll(unacked.map((s) => s.id))}
        >
          未確認の{unacked.length}件をまとめて確認する
        </Button>
      )}
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone?: "warn" | "ok" }) {
  return (
    <div className="rounded-xl border border-hairline bg-base px-2 py-2">
      <p className="text-[11px] text-muted">{label}</p>
      <p
        className={`text-lg font-semibold tnum ${
          tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/* ================= 確定シフト1行（確認チェック＋実績入力） ================= */
function ShiftRow({
  shift,
  attendance,
  locked,
  busy,
  setBusy,
  onChanged,
}: {
  shift: Shift;
  attendance?: AttendanceRecord;
  locked: boolean;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onChanged: () => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { storeName } = useApp();
  const notify = useToast();
  const [editing, setEditing] = useState(false);
  const [actual, setActual] = useState({
    start: attendance?.actual_start?.slice(0, 5) ?? shift.start_time.slice(0, 5),
    end: attendance?.actual_end?.slice(0, 5) ?? shift.end_time.slice(0, 5),
    reason: attendance?.diff_reason ?? "",
  });
  const [error, setError] = useState<string | null>(null);

  const isPast = shift.date <= todayJST();
  const planned = `${timeShort(shift.start_time)}〜${timeShort(shift.end_time)}`;
  const canRecord = isPast && !locked;

  async function acknowledge() {
    setBusy(true);
    const { error: err } = await supabase.rpc("acknowledge_shift", { p_shift_id: shift.id });
    if (err) notify("確認できませんでした。もう一度お試しください", "error");
    await onChanged();
    setBusy(false);
  }

  async function upsertAttendance(start: string, end: string, reason: string | null): Promise<boolean> {
    setBusy(true);
    const { error: err } = await supabase.from("attendance_records").upsert(
      { shift_id: shift.id, actual_start: start, actual_end: end, diff_reason: reason },
      { onConflict: "shift_id" }
    );
    if (err) {
      notify(
        /closed|締め/.test(err.message)
          ? "この月は締め済みのため変更できません。管理者に連絡してください"
          : "実績を保存できませんでした",
        "error"
      );
      setBusy(false);
      return false;
    }
    await onChanged();
    setBusy(false);
    return true;
  }

  // 予定どおり働いた日はワンタップで記録
  async function recordAsPlanned() {
    if (await upsertAttendance(shift.start_time.slice(0, 5), shift.end_time.slice(0, 5), null)) {
      notify(`${dateLabelJa(shift.date)}の実績を記録しました`);
    }
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
    if (await upsertAttendance(actual.start, actual.end, actual.reason.trim() || null)) {
      setEditing(false);
    }
  }

  return (
    <li className="py-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="w-24 shrink-0 text-sm font-semibold text-ink tnum">{dateLabelJa(shift.date)}</span>
        <span className="text-sm text-ink tnum">{planned}</span>
        <span className="text-xs text-muted">{storeName(shift.store_id)}</span>
        <span className="flex-1" />
        {attendance ? (
          <Badge color={attendance.diff_reason ? "warn" : "ok"}>
            実績 {timeShort(attendance.actual_start)}〜{timeShort(attendance.actual_end)}
          </Badge>
        ) : (
          isPast && <Badge color="warn">実績 未記録</Badge>
        )}
      </div>
      {attendance?.diff_reason && (
        <p className="text-xs text-warn mt-1 pl-24">理由: {attendance.diff_reason}</p>
      )}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {shift.acknowledged_at ? (
          <Badge color="ok">確認済み</Badge>
        ) : (
          <Button variant="secondary" disabled={busy} onClick={acknowledge}>
            確認しました
          </Button>
        )}
        {canRecord && !attendance && (
          <Button disabled={busy} onClick={recordAsPlanned}>
            予定どおり
          </Button>
        )}
        {canRecord && (
          <Button variant="ghost" disabled={busy} onClick={() => setEditing(!editing)}>
            {attendance ? "実績を修正" : "時間を入力"}
          </Button>
        )}
      </div>
      {editing && canRecord && (
        <div className="mt-2 rounded-xl border border-hairline bg-base p-3 space-y-2 fade-in">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="time"
              value={actual.start}
              onChange={(e) => setActual({ ...actual, start: e.target.value })}
              className="min-h-11 rounded-lg border border-hairline bg-surface px-2 text-sm outline-none focus:border-gold"
              aria-label="実開始"
            />
            <span className="text-muted">〜</span>
            <input
              type="time"
              value={actual.end}
              onChange={(e) => setActual({ ...actual, end: e.target.value })}
              className="min-h-11 rounded-lg border border-hairline bg-surface px-2 text-sm outline-none focus:border-gold"
              aria-label="実終了"
            />
            <input
              type="text"
              value={actual.reason}
              onChange={(e) => setActual({ ...actual, reason: e.target.value })}
              placeholder="ずれた場合の理由（残業・早退など）"
              className="flex-1 min-w-40 min-h-11 rounded-lg border border-hairline bg-surface px-2 text-sm outline-none focus:border-gold"
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
