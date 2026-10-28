"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { AdminTabs, MonthNav } from "@/components/admin-tabs";
import { AdminAttendanceRow } from "@/components/attendance-row";
import { MailComposeButtons } from "@/components/mail-compose";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, ListSkeleton, StepHeader, TextField } from "@/components/ui";
import { downloadCsv } from "@/lib/csv";
import {
  addMonths,
  dateSlash,
  hoursLabel,
  monthLabelJa,
  staffLabel,
  todayJST,
  yen,
} from "@/lib/format";
import {
  attendanceCsvRows,
  buildAttMap,
  confirmedPayRows,
  defaultCloseMonth,
  missingAttendance,
  payCsvRows,
  shiftMinutes,
} from "@/lib/payroll";
import { EMPLOYMENT_LABEL } from "@/lib/types";
import type {
  AttendanceRecord,
  BusinessSettings,
  ContractorInvoice,
  PayrollClosing,
  Shift,
  Staff,
  StaffDocument,
  StaffPaySettings,
  StaffTransportCost,
} from "@/lib/types";

// 月締め・給与連携（管理者）
//   ① 勤務実績の確認 → ② 報酬の確認 → ③ 月を締める（ロック）→ ④ 社労士・税理士へ共有
//   → ⑤ 給与明細の配布 → ⑥ 業務委託の請求書、を1画面で順番に進める
export default function PayrollPage() {
  return (
    <Suspense>
      <Payroll />
    </Suspense>
  );
}

function Payroll() {
  const params = useSearchParams();
  const { storeName } = useApp();
  const supabase = useMemo(() => createClient(), []);
  const notify = useToast();

  const [closings, setClosings] = useState<PayrollClosing[] | null>(null);
  const [chosenMonth, setChosenMonth] = useState<string | null>(params.get("month"));
  const month =
    chosenMonth ?? (closings ? defaultCloseMonth(closings.map((c) => c.month)) : null);

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [paySettings, setPaySettings] = useState<Map<number, StaffPaySettings>>(new Map());
  const [costs, setCosts] = useState<StaffTransportCost[]>([]);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [docs, setDocs] = useState<StaffDocument[]>([]);
  const [invoices, setInvoices] = useState<ContractorInvoice[]>([]);
  const [busy, setBusy] = useState(false);
  const [detailStaffId, setDetailStaffId] = useState<number | null>(null);

  const loadClosings = useCallback(async () => {
    const { data } = await supabase.from("payroll_closings").select("*").order("month", { ascending: false });
    setClosings((data as PayrollClosing[]) ?? []);
  }, [supabase]);

  const load = useCallback(async () => {
    if (!month) return;
    const monthEnd = addMonths(month, 1);
    const [st, sh, ps, tc, bs, dc, iv] = await Promise.all([
      supabase.from("staff").select("*").eq("is_active", true).order("id"),
      supabase.from("shifts").select("*").gte("date", month).lt("date", monthEnd).order("date"),
      supabase.from("staff_pay_settings").select("*"),
      supabase.from("staff_transport_costs").select("*"),
      supabase.from("business_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("staff_documents").select("*").eq("month", month),
      supabase.from("contractor_invoices").select("*").eq("month", month),
    ]);
    const shiftRows = (sh.data as Shift[]) ?? [];
    setStaffList((st.data as Staff[]) ?? []);
    setPaySettings(new Map(((ps.data as StaffPaySettings[]) ?? []).map((p) => [p.staff_id, p])));
    setCosts((tc.data as StaffTransportCost[]) ?? []);
    setSettings((bs.data as BusinessSettings | null) ?? null);
    setDocs((dc.data as StaffDocument[]) ?? []);
    setInvoices((iv.data as ContractorInvoice[]) ?? []);
    if (shiftRows.length > 0) {
      const { data: att } = await supabase
        .from("attendance_records")
        .select("*")
        .in("shift_id", shiftRows.map((s) => s.id));
      setAttendance((att as AttendanceRecord[]) ?? []);
    } else {
      setAttendance([]);
    }
    setShifts(shiftRows);
  }, [supabase, month]);

  useEffect(() => {
    loadClosings();
  }, [loadClosings]);
  useEffect(() => {
    load();
  }, [load]);

  const closing = (closings ?? []).find((c) => c.month === month) ?? null;
  const allShifts = shifts ?? [];
  const drafts = allShifts.filter((s) => s.status === "draft");
  const missing = missingAttendance(allShifts, attendance);
  const payRows = useMemo(
    () => confirmedPayRows(staffList, shifts ?? [], attendance, costs, paySettings),
    [staffList, shifts, attendance, costs, paySettings]
  );
  const totals = payRows.reduce(
    (a, r) => ({
      days: a.days + r.days,
      minutes: a.minutes + r.minutes,
      reward: a.reward + (r.reward ?? 0),
      rewardTaxed: a.rewardTaxed + (r.rewardTaxed ?? 0),
      transport: a.transport + r.transport,
    }),
    { days: 0, minutes: 0, reward: 0, rewardTaxed: 0, transport: 0 }
  );
  const payWarnings = payRows.flatMap((r) => [
    ...(r.hourlyWage === null ? [`${r.staff.name}: 時間給が未設定です`] : []),
    ...r.missingStores.map((id) => `${r.staff.name}: ${storeName(id)}の交通費が未設定です（0円で計算）`),
  ]);
  const workers = payRows.map((r) => r.staff);
  const contractors = workers.filter((s) => s.employment_type === "contractor");
  const payslipOf = (staffId: number) =>
    docs.filter((d) => d.staff_id === staffId && d.category === "給与明細");

  async function fillMissing() {
    if (missing.length === 0) return;
    if (!window.confirm(`実績が未記録の ${missing.length} 日分を「予定どおり」で記録しますか？\n（残業・早退があった日は、あとで「日別」から修正できます）`)) return;
    setBusy(true);
    const { error } = await supabase.from("attendance_records").upsert(
      missing.map((s) => ({ shift_id: s.id, actual_start: s.start_time, actual_end: s.end_time })),
      { onConflict: "shift_id", ignoreDuplicates: true }
    );
    if (error) notify(error.message.includes("月締め済み") ? error.message : "記録できませんでした", "error");
    else notify(`${missing.length}日分を記録しました`);
    await load();
    setBusy(false);
  }

  async function closeMonth() {
    if (!month) return;
    const notes = [
      // 月の途中で締めると、残りの日の勤務実績を記録できなくなる
      todayJST() < addMonths(month, 1)
        ? `・${monthLabelJa(month)}はまだ終わっていません（締めると、これからの日の実績を記録できなくなります）`
        : "",
      drafts.length > 0 ? `・確定していないシフトが ${drafts.length} 件あります（集計されません）` : "",
      missing.length > 0 ? `・実績が未記録の日が ${missing.length} 日あります（予定時間で計算されます）` : "",
    ].filter(Boolean);
    if (
      !window.confirm(
        `${monthLabelJa(month)}を締めますか？\n締めると、この月のシフト・勤務実績は変更できなくなり、業務委託スタッフが請求書を作成できるようになります。${
          notes.length ? `\n\n${notes.join("\n")}` : ""
        }`
      )
    )
      return;
    setBusy(true);
    const { error } = await supabase.from("payroll_closings").insert({ month });
    if (error) notify("締められませんでした（029_payroll_close_invoices.sql が未実行の可能性があります）", "error");
    else notify(`${monthLabelJa(month)}を締めました`);
    await loadClosings();
    setBusy(false);
  }

  async function reopenMonth() {
    if (!month) return;
    const warn = invoices.length > 0 ? "\n\n業務委託の請求書がすでに作成されています。内容を変えた場合は、本人に請求書を作り直してもらってください（送信済みの請求書は削除が必要です）。" : "";
    if (!window.confirm(`${monthLabelJa(month)}の締めを解除しますか？\nシフト・勤務実績が再び変更できるようになります。${warn}`)) return;
    setBusy(true);
    const { error } = await supabase.from("payroll_closings").delete().eq("month", month);
    if (error) notify("解除できませんでした", "error");
    else notify("締めを解除しました");
    await loadClosings();
    setBusy(false);
  }

  function exportAttendance() {
    if (!month) return;
    downloadCsv(`勤務実績_${month.slice(0, 7)}.csv`, attendanceCsvRows(allShifts, attendance, staffList, (id) => storeName(id)));
  }
  function exportPay() {
    if (!month) return;
    downloadCsv(`報酬交通費_${month.slice(0, 7)}.csv`, payCsvRows(payRows));
  }

  const att = buildAttMap(attendance);
  const monthLabel = month ? monthLabelJa(month) : "";
  const company = settings?.company_name || "NOBLE";
  const accountantDraft = {
    to: settings?.accountant_email ?? "",
    subject: `【${company}】${monthLabel}分 報酬・交通費のご連絡`,
    body: [
      `${settings?.accountant_name || "税理士"} 様`,
      "",
      "いつもお世話になっております。",
      `${monthLabel}分の報酬・交通費をお送りします。`,
      "",
      `・対象スタッフ: ${payRows.length}名`,
      `・稼働: 延べ${totals.days}日 / ${hoursLabel(totals.minutes)}`,
      `・報酬（税抜・交通費込み）: ${yen(totals.reward)}`,
      `・報酬（税込・交通費込み）: ${yen(totals.rewardTaxed)}`,
      `・うち交通費: ${yen(totals.transport)}`,
      "",
      `詳細は添付のCSV（報酬交通費_${month?.slice(0, 7)}.csv）をご確認ください。`,
      "給与明細ができましたら、ご返送をお願いいたします。",
      "",
      "よろしくお願いいたします。",
    ].join("\n"),
  };
  const laborDraft = {
    to: settings?.labor_consultant_email ?? "",
    subject: `【${company}】${monthLabel}分 勤務実績のご連絡`,
    body: [
      `${settings?.labor_consultant_name || "社労士"} 様`,
      "",
      "いつもお世話になっております。",
      `${monthLabel}分の勤務実績をお送りします。`,
      "",
      `・対象スタッフ: ${payRows.length}名 / 延べ${totals.days}日・${hoursLabel(totals.minutes)}`,
      "",
      `詳細は添付のCSV（勤務実績_${month?.slice(0, 7)}.csv）をご確認ください。`,
      "",
      "よろしくお願いいたします。",
    ].join("\n"),
  };

  const step1Done = shifts !== null && missing.length === 0 && drafts.length === 0;
  const step2Done = shifts !== null && payWarnings.length === 0;
  const step5Done = workers.length > 0 && workers.every((s) => payslipOf(s.id).length > 0);
  const step6Done = contractors.every((s) => invoices.some((i) => i.staff_id === s.id && i.sent_at));

  return (
    <div className="space-y-5 fade-in">
      <AdminTabs />
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="serif text-3xl text-ink">月締め・給与連携</h1>
          <p className="text-sm text-muted mt-1">
            月末はこの順番で進めます。終わった手順には ✓ が付きます
          </p>
        </div>
        {month && (
          <MonthNav
            month={month}
            onChange={(m) => {
              setShifts(null);
              setDetailStaffId(null);
              setChosenMonth(m);
            }}
          />
        )}
      </div>

      {!month || shifts === null ? (
        <ListSkeleton rows={5} />
      ) : (
        <>
          <div
            className={`rounded-2xl border px-4 py-3 flex items-center gap-3 ${
              closing ? "border-ok/40 bg-ok-soft" : "border-gold/40 bg-gold-soft/50"
            }`}
          >
            <span className="text-2xl" aria-hidden>
              {closing ? "🔒" : "📝"}
            </span>
            <div className="text-sm">
              <p className={`font-semibold ${closing ? "text-ok" : "text-gold-dk"}`}>
                {monthLabel}は{closing ? "締め済みです" : "まだ締めていません"}
              </p>
              <p className="text-xs text-muted">
                {closing
                  ? `${dateSlash(closing.closed_at)} に締めました。シフト・勤務実績は変更できません`
                  : "実績の確認が終わったら、③で締めてください"}
              </p>
            </div>
          </div>

          {/* ① 勤務実績 */}
          <Card className="p-4 space-y-3">
            <StepHeader no={1} title="勤務実績を確認する" done={step1Done}>
              <p className="text-xs text-muted">
                スタッフが「マイシフト」で記録した実績を確認します。残業・早退があった日は、理由と一緒に修正してください
              </p>
            </StepHeader>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge color={missing.length ? "warn" : "ok"}>
                実績の未記録 {missing.length}日
              </Badge>
              <Badge color={drafts.length ? "warn" : "ok"}>未確定のシフト {drafts.length}件</Badge>
            </div>
            {drafts.length > 0 && (
              <p className="text-xs text-warn">
                ⚠ 確定していないシフトは集計されません。
                <Link href={`/calendar/manage`} className="underline underline-offset-2">
                  シフト管理
                </Link>
                で確定してください
              </p>
            )}
            {!closing && missing.length > 0 && (
              <Button variant="secondary" disabled={busy} onClick={fillMissing}>
                未記録の {missing.length} 日分を予定どおりで一括記録
              </Button>
            )}
            <ul className="divide-y divide-hairline">
              {payRows.map((r) => {
                const own = allShifts.filter((s) => s.staff_id === r.staff.id && s.status === "confirmed");
                const planned = own.reduce((a, s) => a + shiftMinutes(s, undefined), 0);
                const recorded = own.filter((s) => att.has(s.id)).length;
                const reasons = own.filter((s) => att.get(s.id)?.diff_reason).length;
                return (
                  <li key={r.staff.id} className="py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-ink">{staffLabel(r.staff)}</p>
                        <p className="text-xs text-muted tnum">
                          予定 {hoursLabel(planned)} → 実績 {hoursLabel(r.minutes)} ・ 記録 {recorded}/{own.length}日
                          {reasons > 0 && ` ・ 理由つき ${reasons}日`}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        onClick={() => setDetailStaffId(detailStaffId === r.staff.id ? null : r.staff.id)}
                      >
                        {detailStaffId === r.staff.id ? "閉じる" : "日別"}
                      </Button>
                    </div>
                    {detailStaffId === r.staff.id && (
                      <ul className="mt-2 rounded-xl border border-hairline bg-base px-3 divide-y divide-hairline fade-in">
                        {own.map((s) => (
                          <AdminAttendanceRow
                            key={s.id}
                            shift={s}
                            attendance={att.get(s.id)}
                            storeName={storeName}
                            busy={busy}
                            setBusy={setBusy}
                            onSaved={load}
                            locked={!!closing}
                          />
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
              {payRows.length === 0 && (
                <li className="py-3 text-sm text-muted">{monthLabel}の確定シフトはありません</li>
              )}
            </ul>
          </Card>

          {/* ② 報酬 */}
          <Card className="p-4 space-y-3">
            <StepHeader no={2} title="報酬・交通費を確認する" done={step2Done}>
              <p className="text-xs text-muted">
                時間給 × 稼働時間 ＋ 交通費（店舗ごとの往復額 × 出勤日数）で自動計算しています
              </p>
            </StepHeader>
            <ul className="space-y-2">
              {payRows.map((r) => (
                <li key={r.staff.id} className="rounded-xl border border-hairline bg-base px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">
                      {staffLabel(r.staff)}
                      {r.staff.employment_type && (
                        <span className="ml-1.5 text-[11px] font-normal text-muted">
                          {EMPLOYMENT_LABEL[r.staff.employment_type]}
                        </span>
                      )}
                    </p>
                    <p className="text-base font-semibold text-ink tnum">
                      {r.rewardTaxed === null ? "—" : yen(r.rewardTaxed)}
                    </p>
                  </div>
                  <p className="text-xs text-muted tnum mt-0.5">
                    {r.days}日・{hoursLabel(r.minutes)} × {r.hourlyWage === null ? "時間給未設定" : yen(r.hourlyWage)}
                    {" ＋ 交通費 "}
                    {yen(r.transport)}（税抜 {r.reward === null ? "—" : yen(r.reward)}）
                  </p>
                </li>
              ))}
            </ul>
            {payRows.length > 0 && (
              <p className="flex items-baseline justify-between gap-2 border-t border-hairline pt-2 text-sm">
                <span className="text-muted">合計（税込・交通費込み）</span>
                <span className="text-lg font-semibold text-ink tnum">{yen(totals.rewardTaxed)}</span>
              </p>
            )}
            {payWarnings.map((w) => (
              <p key={w} className="text-xs text-warn">
                ⚠ {w}
              </p>
            ))}
            <p className="text-xs text-muted">
              時間給・交通費の設定は{" "}
              <Link href="/calendar/manage" className="text-gold-dk underline underline-offset-2">
                シフト管理 ＞ 時間給・交通費を設定
              </Link>{" "}
              から変更できます
            </p>
          </Card>

          {/* ③ 締める */}
          <Card className="p-4 space-y-3">
            <StepHeader no={3} title="月を締める" done={!!closing}>
              <p className="text-xs text-muted">
                締めると、この月のシフト・勤務実績が変更できなくなり（金額が確定）、
                業務委託スタッフが請求書を作成できるようになります
              </p>
            </StepHeader>
            {closing ? (
              <div className="flex items-center gap-2 flex-wrap">
                <Badge color="ok">締め済み {dateSlash(closing.closed_at)}</Badge>
                <Button variant="ghost" disabled={busy} onClick={reopenMonth}>
                  締めを解除する
                </Button>
              </div>
            ) : (
              <Button disabled={busy || payRows.length === 0} onClick={closeMonth}>
                {monthLabel}を締める
              </Button>
            )}
          </Card>

          {/* ④ 社労士・税理士へ */}
          <Card className="p-4 space-y-4">
            <StepHeader no={4} title="社労士・税理士に送る">
              <p className="text-xs text-muted">
                ① CSVを保存 → ② メールを作成（宛先・件名・本文は入力済み）→ ③ 保存したCSVを添付して送信
              </p>
            </StepHeader>
            {!closing && (
              <p className="text-xs text-warn">⚠ まだ締めていないため、あとで数字が変わる可能性があります</p>
            )}
            <div className="space-y-2 rounded-xl border border-hairline bg-base p-3">
              <p className="text-sm font-semibold text-ink">
                税理士（報酬・交通費）
                {settings?.accountant_name && <span className="ml-1 font-normal text-muted">{settings.accountant_name}</span>}
              </p>
              <Button variant="secondary" disabled={payRows.length === 0} onClick={exportPay}>
                報酬・交通費CSVを保存
              </Button>
              <MailComposeButtons draft={accountantDraft} />
            </div>
            <div className="space-y-2 rounded-xl border border-hairline bg-base p-3">
              <p className="text-sm font-semibold text-ink">
                社労士（勤務実績）
                {settings?.labor_consultant_name && <span className="ml-1 font-normal text-muted">{settings.labor_consultant_name}</span>}
              </p>
              <Button variant="secondary" disabled={payRows.length === 0} onClick={exportAttendance}>
                勤務実績CSVを保存
              </Button>
              <MailComposeButtons draft={laborDraft} />
            </div>
            <p className="text-[11px] text-muted">
              CSVは Excel・Googleスプレッドシートで文字化けせずに開けます。送付先のメールアドレスは下の「送付先の設定」で登録します
            </p>
          </Card>

          {/* ⑤ 給与明細 */}
          <Card className="p-4 space-y-3">
            <StepHeader no={5} title="給与明細を配布する" done={step5Done}>
              <p className="text-xs text-muted">
                税理士から届いた給与明細（PDF）をアップロードすると、各スタッフの「マイ書類」に届きます
              </p>
            </StepHeader>
            <ul className="divide-y divide-hairline">
              {workers.map((s) => {
                const slips = payslipOf(s.id);
                return (
                  <li key={s.id} className="py-2 flex items-center gap-2">
                    <span className="flex-1 text-sm text-ink">{staffLabel(s)}</span>
                    {slips.length === 0 ? (
                      <Badge color="warn">未配布</Badge>
                    ) : slips.every((d) => d.viewed_at) ? (
                      <Badge color="ok">配布済み・既読</Badge>
                    ) : (
                      <Badge color="gold">配布済み・未読</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
            <Link
              href={`/admin/staff-docs?month=${month}&category=${encodeURIComponent("給与明細")}`}
              className="inline-flex items-center justify-center min-h-11 rounded-full px-5 text-sm font-semibold bg-surface text-gold-dk border border-gold hover:bg-gold-soft transition-colors"
            >
              {monthLabel}の給与明細を配布する
            </Link>
          </Card>

          {/* ⑥ 業務委託の請求書 */}
          {contractors.length > 0 && (
            <Card className="p-4 space-y-3">
              <StepHeader no={6} title="業務委託の請求書を受け取る" done={step6Done}>
                <p className="text-xs text-muted">
                  月を締めると、業務委託スタッフは「メニュー ＞ 請求書」から、この月の請求書を作成してGmailで送信できます
                </p>
              </StepHeader>
              <ul className="divide-y divide-hairline">
                {contractors.map((s) => {
                  const inv = invoices.find((i) => i.staff_id === s.id);
                  return (
                    <li key={s.id} className="py-2 flex items-center gap-2 flex-wrap">
                      <span className="flex-1 min-w-0 text-sm text-ink">{staffLabel(s)}</span>
                      {!inv ? (
                        <Badge color="warn">{closing ? "未作成" : "締め待ち"}</Badge>
                      ) : (
                        <>
                          <span className="text-sm tnum text-ink">{yen(inv.total)}</span>
                          <Badge color={inv.sent_at ? "ok" : "gold"}>
                            {inv.sent_at ? `送信済み ${dateSlash(inv.sent_at).slice(5)}` : "作成済み・未送信"}
                          </Badge>
                          <Link href={`/invoices/${inv.id}`} className="text-sm text-gold-dk underline underline-offset-2 px-2 min-h-11 inline-flex items-center">
                            見る
                          </Link>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <BusinessSettingsCard settings={settings} onSaved={load} />
        </>
      )}
    </div>
  );
}

/* 送付先・請求書の設定（税理士・社労士のメール、請求書の宛先と支払条件） */
function BusinessSettingsCard({
  settings,
  onSaved,
}: {
  settings: BusinessSettings | null;
  onSaved: () => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function start() {
    setForm({
      company_name: settings?.company_name ?? "",
      invoice_to_email: settings?.invoice_to_email ?? "",
      invoice_cc_email: settings?.invoice_cc_email ?? "",
      payment_terms: settings?.payment_terms ?? "月末締め・翌月末払い",
      payment_due_day: settings?.payment_due_day ? String(settings.payment_due_day) : "",
      accountant_name: settings?.accountant_name ?? "",
      accountant_email: settings?.accountant_email ?? "",
      labor_consultant_name: settings?.labor_consultant_name ?? "",
      labor_consultant_email: settings?.labor_consultant_email ?? "",
    });
    setOpen(true);
  }

  async function save() {
    const due = form.payment_due_day.trim();
    if (due && (!/^\d+$/.test(due) || Number(due) < 1 || Number(due) > 31)) {
      notify("支払日は1〜31の数字で入力してください（空欄＝月末）", "error");
      return;
    }
    setBusy(true);
    const payload: Record<string, string | number | null> = { id: 1 };
    for (const [k, v] of Object.entries(form)) payload[k] = v.trim() || null;
    payload.payment_terms = form.payment_terms.trim() || "月末締め・翌月末払い";
    payload.payment_due_day = due ? Number(due) : null;
    const { error } = await supabase.from("business_settings").upsert(payload, { onConflict: "id" });
    setBusy(false);
    if (error) {
      notify("保存できませんでした", "error");
      return;
    }
    notify("送付先を保存しました");
    setOpen(false);
    await onSaved();
  }

  const set = (k: string) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">送付先の設定</h2>
        {!open && (
          <Button variant="ghost" onClick={start}>
            編集
          </Button>
        )}
      </div>
      {!open ? (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-[11px] font-semibold text-muted">税理士</dt>
            <dd className="text-ink break-all">
              {settings?.accountant_email ? `${settings.accountant_name ?? ""} ${settings.accountant_email}` : "未設定"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-muted">社労士</dt>
            <dd className="text-ink break-all">
              {settings?.labor_consultant_email
                ? `${settings.labor_consultant_name ?? ""} ${settings.labor_consultant_email}`
                : "未設定"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-muted">請求書の宛先（業務委託）</dt>
            <dd className="text-ink break-all">{settings?.company_name ?? "未設定"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-muted">請求書の送付先メール</dt>
            <dd className="text-ink break-all">{settings?.invoice_to_email ?? "未設定"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[11px] font-semibold text-muted">支払条件</dt>
            <dd className="text-ink">
              {settings?.payment_terms ?? "月末締め・翌月末払い"}
              {settings?.payment_due_day ? `（翌月${settings.payment_due_day}日払い）` : "（翌月末払い）"}
            </dd>
          </div>
        </dl>
      ) : (
        <div className="space-y-4 fade-in">
          <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <legend className="text-xs font-semibold text-gold-dk mb-1">税理士・社労士</legend>
            <TextField label="税理士のお名前（メールの宛名）" value={form.accountant_name} onChange={set("accountant_name")} />
            <TextField label="税理士のメールアドレス" type="email" value={form.accountant_email} onChange={set("accountant_email")} />
            <TextField label="社労士のお名前（メールの宛名）" value={form.labor_consultant_name} onChange={set("labor_consultant_name")} />
            <TextField label="社労士のメールアドレス" type="email" value={form.labor_consultant_email} onChange={set("labor_consultant_email")} />
          </fieldset>
          <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <legend className="text-xs font-semibold text-gold-dk mb-1">業務委託スタッフの請求書</legend>
            <TextField label="請求書の宛先（会社名・屋号）" placeholder="株式会社〇〇" value={form.company_name} onChange={set("company_name")} />
            <TextField label="請求書の送付先メール" type="email" value={form.invoice_to_email} onChange={set("invoice_to_email")} />
            <TextField label="CC（任意）" type="email" value={form.invoice_cc_email} onChange={set("invoice_cc_email")} />
            <TextField label="支払条件（請求書に記載）" value={form.payment_terms} onChange={set("payment_terms")} />
            <TextField
              label="支払日（翌月の何日。空欄＝月末）"
              inputMode="numeric"
              value={form.payment_due_day}
              onChange={set("payment_due_day")}
            />
          </fieldset>
          <div className="flex gap-2">
            <Button disabled={busy} onClick={save}>
              {busy ? "保存中…" : "保存する"}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
