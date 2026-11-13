"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { Badge, Button, Card, ListSkeleton, SectionTitle, TextArea } from "@/components/ui";
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
  ShiftRequestSubmission,
} from "@/lib/types";
import { daysUntil, deadlineLabel } from "@/lib/shift-requests";

// スタッフ本人用: 希望提出 / 確定シフト確認 / 勤務実績
export default function MyShiftPage() {
  const { me, storeName } = useApp();
  const supabase = useMemo(() => createClient(), []);

  const [recruitment, setRecruitment] = useState<ShiftRecruitment | null>(null);
  const [recruitmentLoaded, setRecruitmentLoaded] = useState(false);
  const [requests, setRequests] = useState<Map<string, ShiftRequest>>(new Map());
  const [submission, setSubmission] = useState<ShiftRequestSubmission | null>(null);
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

    const shiftRows = (sh.data as Shift[]) ?? [];
    setShifts(shiftRows);

    if (recruitmentRow) {
      const [{ data: reqs }, { data: sub }] = await Promise.all([
        supabase
          .from("shift_requests")
          .select("*")
          .eq("staff_id", me.id)
          .eq("month", recruitmentRow.month),
        // 034 未適用の環境ではエラーになるが、提出記録なしとして扱う
        supabase
          .from("shift_request_submissions")
          .select("*")
          .eq("staff_id", me.id)
          .eq("month", recruitmentRow.month)
          .maybeSingle(),
      ]);
      setRequests(new Map(((reqs as ShiftRequest[]) ?? []).map((r) => [r.date, r])));
      setSubmission((sub as ShiftRequestSubmission | null) ?? null);
    } else {
      setSubmission(null);
    }
    // 提出記録を読み込んでから表示する（コメント欄の初期値に使うため）
    setRecruitment(recruitmentRow);
    setRecruitmentLoaded(true);

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

      {/* 希望提出（募集中の月があるときだけ入力欄を表示） */}
      {recruitment ? (
        <RequestSection
          key={recruitment.id}
          recruitment={recruitment}
          requests={requests}
          submission={submission}
          staffId={me.id}
          onChanged={load}
        />
      ) : recruitmentLoaded ? (
        <Card className="p-4">
          <p className="text-sm text-muted">
            いまは受付中のシフト希望はありません。管理者が受付を始めると、ここに希望の入力欄が表示されます
            （トップページにもお知らせが出ます）。
          </p>
        </Card>
      ) : null}

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
  submission,
  staffId,
  onChanged,
}: {
  recruitment: ShiftRecruitment;
  requests: Map<string, ShiftRequest>;
  submission: ShiftRequestSubmission | null;
  staffId: number;
  onChanged: () => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const [timeEditDate, setTimeEditDate] = useState<string | null>(null);
  const [timeDraft, setTimeDraft] = useState({ start: "10:00", end: "19:00" });
  const [comment, setComment] = useState(submission?.comment ?? "");

  const days = useMemo(() => {
    const [y, m] = recruitment.month.split("-").map(Number);
    const count = new Date(y, m, 0).getDate();
    return Array.from(
      { length: count },
      (_, i) => `${recruitment.month.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`
    );
  }, [recruitment.month]);

  // 保存に失敗したら必ず知らせる（受付が締め切られた直後など）
  function reportError(error: { message: string } | null): boolean {
    if (!error) return false;
    console.error(error);
    notify(
      /row-level security/i.test(error.message)
        ? "保存できませんでした。受付が締め切られた可能性があります（画面を更新してください）"
        : "保存できませんでした。通信状況を確認して、もう一度お試しください",
      "error"
    );
    return true;
  }

  async function setType(date: string, type: RequestType, start?: string, end?: string) {
    if (type === "time" && start && end && start >= end) {
      notify("終了時刻は開始時刻より後にしてください", "error");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("shift_requests").upsert(
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
    reportError(error);
    await onChanged();
    setBusy(false);
    setTimeEditDate(null);
  }

  // 時間指定を開くときは、入力済みの時間を初期値にする
  function openTimeEditor(date: string) {
    if (timeEditDate === date) {
      setTimeEditDate(null);
      return;
    }
    const req = requests.get(date);
    if (req?.type === "time" && req.start_time && req.end_time) {
      setTimeDraft({ start: timeShortHM(req.start_time), end: timeShortHM(req.end_time) });
    }
    setTimeEditDate(date);
  }

  // クイック入力: 未入力の日をすべて「いつも通り」で埋める
  async function fillUsual() {
    setBusy(true);
    const blanks = days.filter((d) => !requests.has(d));
    if (blanks.length > 0) {
      const { error } = await supabase.from("shift_requests").upsert(
        blanks.map((date) => ({
          staff_id: staffId,
          month: recruitment.month,
          date,
          type: "usual" as const,
        })),
        { onConflict: "staff_id,date" }
      );
      reportError(error);
    }
    await onChanged();
    setBusy(false);
  }

  const submitted = days.filter((d) => requests.has(d)).length;
  const blanks = days.length - submitted;

  // 「提出する」: 提出日時とコメントを記録（提出後も受付中は変更でき、変更はそのまま反映される）
  async function submit() {
    if (
      blanks > 0 &&
      !window.confirm(`まだ入力していない日が${blanks}日あります。このまま提出しますか？\n（入力していない日は「希望なし」として扱われます）`)
    ) {
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("shift_request_submissions").upsert(
      {
        staff_id: staffId,
        month: recruitment.month,
        comment: comment.trim() || null,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "staff_id,month" }
    );
    setBusy(false);
    if (error) {
      if (/shift_request_submissions|schema cache|does not exist/i.test(error.message)) {
        notify("入力した希望は保存されています（提出ボタンを使うには、管理者が 034 の SQL を実行する必要があります）", "error");
      } else {
        reportError(error);
      }
      return;
    }
    notify(submission?.submitted_at ? "提出内容を更新しました" : `${monthLabelJa(recruitment.month)}のシフト希望を提出しました`);
    await onChanged();
  }

  const left = recruitment.deadline ? daysUntil(recruitment.deadline) : null;

  return (
    <Card className="p-4 space-y-3 border-gold/50">
      <SectionTitle>
        シフト希望の提出（{monthLabelJa(recruitment.month)}・受付中）
      </SectionTitle>

      <div className="flex items-center gap-2 flex-wrap">
        {submission?.submitted_at ? (
          <Badge color="ok">提出済み {dateTimeShort(submission.submitted_at)}</Badge>
        ) : (
          <Badge color="warn">未提出</Badge>
        )}
        {recruitment.deadline && (
          <span className={`text-sm font-semibold ${left !== null && left <= 2 ? "text-caution" : "text-ink"}`}>
            締切 {deadlineLabel(recruitment.deadline)}
          </span>
        )}
      </div>
      {recruitment.note && <p className="text-sm text-warn font-medium whitespace-pre-wrap">{recruitment.note}</p>}

      <ol className="text-xs text-muted list-decimal pl-5 space-y-0.5">
        <li>日ごとに ○（出勤できる）・×（休み希望）・時間指定・いつも通り・お任せ を選びます（タップするとすぐ保存されます）</li>
        <li>伝えたいことがあれば、下の「コメント」に書きます</li>
        <li>最後に「提出する」を押します。締切までは、提出後も変更できます</li>
      </ol>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted tnum">
          {submitted}/{days.length} 日 入力済み
        </p>
        <Button variant="secondary" disabled={busy || blanks === 0} onClick={fillUsual}>
          残りすべて「いつも通り」にする
        </Button>
      </div>

      <p className="text-[11px] text-muted">
        ○＝出勤できる　×＝休み希望　時間＝時間を指定　いつも＝いつも通り　お任せ＝お任せ
      </p>
      <ul className="divide-y divide-hairline">
        {days.map((date) => {
          const req = requests.get(date);
          const weekday = new Date(`${date}T12:00:00+09:00`).getUTCDay();
          return (
            <li key={date} className="py-1.5">
              <div className="flex items-center gap-2">
                <span
                  className={`w-[4.25rem] shrink-0 text-sm tnum ${
                    weekday === 0 ? "text-rose" : weekday === 6 ? "text-gold-dk" : "text-ink"
                  } ${req ? "" : "font-semibold"}`}
                >
                  {Number(date.slice(8))}日({WEEKDAYS_JA[weekday]})
                </span>
                <div className="grid grid-cols-5 gap-1 flex-1 max-w-md" role="group" aria-label={`${Number(date.slice(8))}日の希望`}>
                  {(Object.keys(REQUEST_TYPE_META) as RequestType[]).map((t) => {
                    const selected = req?.type === t;
                    const label =
                      t === "time" && selected && req?.start_time
                        ? `${timeShort(req.start_time)}-${timeShort(req.end_time ?? "")}`
                        : SHORT_LABEL[t];
                    return (
                      <button
                        key={t}
                        type="button"
                        disabled={busy}
                        aria-pressed={selected}
                        aria-label={REQUEST_TYPE_META[t].label}
                        onClick={() => {
                          if (t === "time") openTimeEditor(date);
                          else setType(date, t);
                        }}
                        className={`min-h-11 rounded-lg border px-0.5 text-[13px] leading-tight tnum transition-colors disabled:opacity-50 ${
                          selected
                            ? t === "ng"
                              ? "border-rose bg-rose-soft text-rose font-semibold"
                              : "border-gold bg-gold-soft text-gold-dk font-semibold"
                            : "border-hairline bg-surface text-ink hover:border-gold"
                        } ${t === "time" && selected ? "text-[11px]" : ""}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {timeEditDate === date && (
                <div className="flex items-center gap-2 mt-2 pl-[4.75rem] fade-in flex-wrap">
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

      <TextArea
        label="コメント（任意）"
        rows={3}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="例: 12/24 は18時まで／月4回くらいを希望／いつも通り＝火・木・土の10〜19時"
      />
      <div className="flex items-center gap-3 flex-wrap">
        <Button disabled={busy} onClick={submit}>
          {submission?.submitted_at ? "提出内容を更新する" : "提出する"}
        </Button>
        {blanks > 0 && <span className="text-xs text-warn">未入力 {blanks}日</span>}
      </div>
    </Card>
  );
}

// スマホで1行に収まる短い表記（凡例を上に表示）
const SHORT_LABEL: Record<RequestType, string> = {
  ok: "○",
  ng: "×",
  time: "時間",
  usual: "いつも",
  any: "お任せ",
};

// "10:00:00" → "10:00"（time 入力用）
function timeShortHM(t: string): string {
  return t.slice(0, 5);
}

// "11/15 10:30"
function dateTimeShort(iso: string): string {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("month")}/${g("day")} ${g("hour")}:${g("minute")}`;
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
