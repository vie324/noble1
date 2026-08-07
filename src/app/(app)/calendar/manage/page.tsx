"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { Badge, Button, Card, Chip, ListSkeleton, SectionTitle } from "@/components/ui";
import { ShiftTabs } from "@/components/shift-tabs";
import { MonthNav } from "@/components/admin-tabs";
import {
  addMonths,
  monthLabelJa,
  thisMonthJST,
  timeShort,
  timeToMinutes,
  yen,
  WEEKDAYS_JA, staffLabel } from "@/lib/format";
import { PAY_TAX_RATE } from "@/lib/types";
import type {
  AttendanceRecord,
  Shift,
  ShiftRecruitment,
  ShiftRequest,
  Staff,
  StaffPaySettings,
  StaffTransportCost,
  Store,
} from "@/lib/types";

const TIME_PRESETS = [
  { start: "10:00", end: "19:00" },
  { start: "11:00", end: "20:00" },
  { start: "10:00", end: "15:00" },
  { start: "15:00", end: "20:00" },
];

const REQUEST_SHORT: Record<string, string> = {
  ok: "○",
  ng: "×",
  time: "時",
  usual: "い",
  any: "任",
};

// シフト管理（管理者専用）: 募集 → 希望を見ながらドラフト作成 → 確定 → 未確認者の把握
export default function ShiftManagePage() {
  const { stores, storeName } = useApp();
  const supabase = useMemo(() => createClient(), []);
  const [month, setMonth] = useState(addMonths(thisMonthJST(), 1)); // 既定は来月（作成対象）

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [recruitment, setRecruitment] = useState<ShiftRecruitment | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [paySettings, setPaySettings] = useState<Map<number, StaffPaySettings>>(new Map());
  const [transportCosts, setTransportCosts] = useState<StaffTransportCost[]>([]);
  const [busy, setBusy] = useState(false);

  // 編集中セル
  const [cell, setCell] = useState<{ staffId: number; date: string } | null>(null);
  const [draft, setDraft] = useState({ start: "10:00", end: "19:00", storeId: 0 });

  // 時間給・交通費の設定エディタの開閉
  const [showPaySettings, setShowPaySettings] = useState(false);

  const monthEnd = addMonths(month, 1);

  const load = useCallback(async () => {
    setShifts(null);
    const [st, sh, rq, rc, ps, tc] = await Promise.all([
      supabase.from("staff").select("*").eq("is_active", true).order("id"),
      supabase
        .from("shifts")
        .select("*")
        .gte("date", month)
        .lt("date", monthEnd)
        .order("date"),
      supabase.from("shift_requests").select("*").eq("month", month),
      supabase.from("shift_recruitments").select("*").eq("month", month).maybeSingle(),
      supabase.from("staff_pay_settings").select("*"),
      supabase.from("staff_transport_costs").select("*"),
    ]);
    setStaffList((st.data as Staff[]) ?? []);
    const shiftRows = (sh.data as Shift[]) ?? [];
    setShifts(shiftRows);
    setRequests((rq.data as ShiftRequest[]) ?? []);
    setRecruitment((rc.data as ShiftRecruitment) ?? null);
    setPaySettings(
      new Map(((ps.data as StaffPaySettings[]) ?? []).map((p) => [p.staff_id, p]))
    );
    setTransportCosts((tc.data as StaffTransportCost[]) ?? []);

    if (shiftRows.length > 0) {
      const { data: att } = await supabase
        .from("attendance_records")
        .select("*")
        .in(
          "shift_id",
          shiftRows.map((s) => s.id)
        );
      setAttendance((att as AttendanceRecord[]) ?? []);
    } else {
      setAttendance([]);
    }
  }, [supabase, month, monthEnd]);

  useEffect(() => {
    load();
  }, [load]);

  const days = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const count = new Date(y, m, 0).getDate();
    return Array.from(
      { length: count },
      (_, i) => `${month.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`
    );
  }, [month]);

  const shiftOf = (staffId: number, date: string) =>
    (shifts ?? []).find((s) => s.staff_id === staffId && s.date === date);
  const requestOf = (staffId: number, date: string) =>
    requests.find((r) => r.staff_id === staffId && r.date === date);

  function openCell(staffId: number, date: string) {
    const existing = shiftOf(staffId, date);
    const staff = staffList.find((s) => s.id === staffId);
    setDraft({
      start: existing?.start_time.slice(0, 5) ?? "10:00",
      end: existing?.end_time.slice(0, 5) ?? "19:00",
      storeId: existing?.store_id ?? staff?.store_id ?? stores[0]?.id ?? 0,
    });
    setCell({ staffId, date });
  }

  async function saveCell() {
    if (!cell) return;
    setBusy(true);
    const existing = shiftOf(cell.staffId, cell.date);
    await supabase.from("shifts").upsert(
      {
        staff_id: cell.staffId,
        date: cell.date,
        store_id: draft.storeId,
        start_time: draft.start,
        end_time: draft.end,
        status: existing?.status ?? "draft",
        acknowledged_at: null, // 変更したら再確認が必要
      },
      { onConflict: "staff_id,date" }
    );
    setCell(null);
    await load();
    setBusy(false);
  }

  async function deleteCell() {
    if (!cell) return;
    const existing = shiftOf(cell.staffId, cell.date);
    if (!existing) {
      setCell(null);
      return;
    }
    setBusy(true);
    await supabase.from("shifts").delete().eq("id", existing.id);
    setCell(null);
    await load();
    setBusy(false);
  }

  async function confirmAll() {
    if (!window.confirm(`${monthLabelJa(month)}のドラフトをすべて確定しますか？`)) return;
    setBusy(true);
    await supabase
      .from("shifts")
      .update({ status: "confirmed" })
      .eq("status", "draft")
      .gte("date", month)
      .lt("date", monthEnd);
    await load();
    setBusy(false);
  }

  async function toggleRecruitment() {
    setBusy(true);
    if (!recruitment) {
      await supabase.from("shift_recruitments").insert({ month, status: "open" });
    } else {
      await supabase
        .from("shift_recruitments")
        .update({ status: recruitment.status === "open" ? "closed" : "open" })
        .eq("id", recruitment.id);
    }
    await load();
    setBusy(false);
  }

  const draftCount = (shifts ?? []).filter((s) => s.status === "draft").length;
  const unacknowledged = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of shifts ?? []) {
      if (s.status === "confirmed" && !s.acknowledged_at) {
        map.set(s.staff_id, (map.get(s.staff_id) ?? 0) + 1);
      }
    }
    return map;
  }, [shifts]);

  // 予定 vs 実績（分単位で集計）
  const planVsActual = useMemo(() => {
    const att = new Map(attendance.map((a) => [a.shift_id, a]));
    return staffList.map((st) => {
      let planned = 0;
      let actual = 0;
      const reasons: { date: string; reason: string }[] = [];
      for (const s of (shifts ?? []).filter(
        (s) => s.staff_id === st.id && s.status === "confirmed"
      )) {
        planned += timeToMinutes(s.end_time) - timeToMinutes(s.start_time);
        const a = att.get(s.id);
        if (a) {
          actual += timeToMinutes(a.actual_end) - timeToMinutes(a.actual_start);
          if (a.diff_reason) reasons.push({ date: s.date, reason: a.diff_reason });
        }
      }
      return { staff: st, planned, actual, reasons };
    });
  }, [staffList, shifts, attendance]);

  // 報酬・交通費の自動計算（ドラフト・確定の全シフト対象。実績が記録された日は実績時間）
  // 交通費はその日の勤務店舗に設定された往復額を日数分積算する
  const payRows = useMemo(() => {
    const att = new Map(attendance.map((a) => [a.shift_id, a]));
    const costMap = new Map(
      transportCosts.map((c) => [`${c.staff_id}:${c.store_id}`, c.round_trip_cost])
    );
    return staffList
      .map((st) => {
        const own = (shifts ?? []).filter((s) => s.staff_id === st.id);
        let minutes = 0;
        let transport = 0;
        const missingStores = new Set<number>();
        for (const s of own) {
          const a = att.get(s.id);
          minutes += a
            ? timeToMinutes(a.actual_end) - timeToMinutes(a.actual_start)
            : timeToMinutes(s.end_time) - timeToMinutes(s.start_time);
          const cost = costMap.get(`${st.id}:${s.store_id}`);
          if (cost == null) missingStores.add(s.store_id);
          else transport += cost;
        }
        const wage = paySettings.get(st.id)?.hourly_wage ?? null;
        const wagePart = wage === null ? null : Math.round((wage * minutes) / 60);
        return {
          staff: st,
          days: own.length,
          minutes,
          hourlyWage: wage,
          transport,
          missingStores: [...missingStores],
          reward: wagePart === null ? null : wagePart + transport,
          rewardTaxed:
            wagePart === null
              ? null
              : Math.round(wagePart * (1 + PAY_TAX_RATE)) + transport,
        };
      })
      .filter((r) => r.days > 0);
  }, [staffList, shifts, attendance, paySettings, transportCosts]);

  const transportWarnings = useMemo(
    () =>
      payRows.flatMap((r) =>
        r.missingStores.map(
          (id) => `${staffLabel(r.staff)}: ${storeName(id)}の交通費が未設定です（0円で計算中）`
        )
      ),
    [payRows, storeName]
  );

  const fmtH = (min: number) => `${(min / 60).toFixed(1)}h`;

  return (
    <div className="space-y-5 fade-in">
      <ShiftTabs />
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="serif text-3xl text-ink">シフト管理</h1>
          <p className="text-sm text-muted mt-1">{monthLabelJa(month)} ・ 管理者専用</p>
        </div>
        <MonthNav month={month} onChange={setMonth} />
      </div>

      {shifts === null ? (
        <ListSkeleton rows={6} />
      ) : (
        <>
          {/* 募集・確定の操作 */}
          <Card className="p-4 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">希望受付:</span>
              {recruitment?.status === "open" ? (
                <Badge color="ok">受付中</Badge>
              ) : recruitment ? (
                <Badge color="warn">締切済み</Badge>
              ) : (
                <Badge color="rose">未開始</Badge>
              )}
            </div>
            <Button variant="secondary" disabled={busy} onClick={toggleRecruitment}>
              {!recruitment ? "希望受付を開始" : recruitment.status === "open" ? "受付を締め切る" : "受付を再開"}
            </Button>
            <span className="flex-1" />
            <span className="text-sm text-muted tnum">ドラフト {draftCount} 件</span>
            <Button disabled={busy || draftCount === 0} onClick={confirmAll}>
              この月を確定する
            </Button>
          </Card>

          {/* 作成グリッド */}
          <Card className="p-4 space-y-3">
            <SectionTitle>シフト作成（セルをタップして編集）</SectionTitle>
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-surface text-left text-xs text-muted font-semibold pr-2 py-1 min-w-28">
                      スタッフ
                    </th>
                    {days.map((d) => {
                      const w = new Date(`${d}T12:00:00+09:00`).getUTCDay();
                      return (
                        <th
                          key={d}
                          className={`text-[10px] font-semibold px-0.5 pb-1 min-w-12 ${
                            w === 0 ? "text-rose" : w === 6 ? "text-gold-dk" : "text-muted"
                          }`}
                        >
                          {Number(d.slice(8))}
                          <br />
                          {WEEKDAYS_JA[w]}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {staffList.map((st) => (
                    <tr key={st.id} className="border-t border-hairline">
                      <td className="sticky left-0 bg-surface text-sm text-ink whitespace-nowrap pr-2 py-1">
                        {staffLabel(st)}
                        {(unacknowledged.get(st.id) ?? 0) > 0 && (
                          <span className="ml-1 align-middle">
                            <Badge color="warn">未確認{unacknowledged.get(st.id)}</Badge>
                          </span>
                        )}
                      </td>
                      {days.map((d) => {
                        const s = shiftOf(st.id, d);
                        const r = requestOf(st.id, d);
                        const isSelected = cell?.staffId === st.id && cell?.date === d;
                        return (
                          <td key={d} className="px-0.5 py-0.5 align-top">
                            <button
                              type="button"
                              onClick={() => openCell(st.id, d)}
                              aria-label={`${st.name} ${d}`}
                              className={`w-12 min-h-11 rounded-lg border text-[10px] leading-tight transition-colors ${
                                isSelected
                                  ? "border-gold bg-gold-soft"
                                  : s
                                    ? s.status === "confirmed"
                                      ? "border-ok/50 bg-ok-soft text-ink"
                                      : "border-warn/60 border-dashed bg-warn-soft/60 text-ink"
                                    : r?.type === "ng"
                                      ? "border-hairline bg-base text-rose"
                                      : "border-hairline bg-surface hover:border-gold"
                              }`}
                            >
                              {s ? (
                                <span className="tnum">
                                  {timeShort(s.start_time)}-{timeShort(s.end_time)}
                                </span>
                              ) : (
                                <span className="text-muted">{r ? REQUEST_SHORT[r.type] : ""}</span>
                              )}
                              {s && r && (
                                <span className="block text-[9px] text-muted">
                                  希望{REQUEST_SHORT[r.type]}
                                </span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted">
              実線＝確定 ／ 破線＝ドラフト ／ ○×時い任＝スタッフの希望（時=時間指定・い=いつも通り・任=お任せ）。
              確定済みセルを変更すると、そのスタッフの確認済みチェックはリセットされます
            </p>

            {/* セル編集パネル */}
            {cell && (
              <div className="rounded-xl border border-gold/40 bg-gold-soft/30 p-3 space-y-3 fade-in">
                <p className="text-sm font-semibold text-ink">
                  {staffLabel(staffList.find((s) => s.id === cell.staffId))} ・{" "}
                  {Number(cell.date.slice(8))}日(
                  {WEEKDAYS_JA[new Date(`${cell.date}T12:00:00+09:00`).getUTCDay()]})
                  {(() => {
                    const r = requestOf(cell.staffId, cell.date);
                    if (!r) return null;
                    return (
                      <span className="ml-2 text-xs text-muted font-normal">
                        希望: {REQUEST_SHORT[r.type]}
                        {r.type === "time" && r.start_time &&
                          ` ${timeShort(r.start_time)}〜${timeShort(r.end_time ?? "")}`}
                        {r.note && ` （${r.note}）`}
                      </span>
                    );
                  })()}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {TIME_PRESETS.map((p) => (
                    <Chip
                      key={`${p.start}-${p.end}`}
                      label={`${timeShort(p.start)}-${timeShort(p.end)}`}
                      selected={draft.start === p.start && draft.end === p.end}
                      onClick={() => setDraft({ ...draft, start: p.start, end: p.end })}
                    />
                  ))}
                  <input
                    type="time"
                    value={draft.start}
                    onChange={(e) => setDraft({ ...draft, start: e.target.value })}
                    className="min-h-10 rounded-lg border border-hairline bg-surface px-2 text-sm outline-none focus:border-gold"
                    aria-label="開始"
                  />
                  <span className="self-center text-muted">〜</span>
                  <input
                    type="time"
                    value={draft.end}
                    onChange={(e) => setDraft({ ...draft, end: e.target.value })}
                    className="min-h-10 rounded-lg border border-hairline bg-surface px-2 text-sm outline-none focus:border-gold"
                    aria-label="終了"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {stores.map((s) => (
                    <Chip
                      key={s.id}
                      label={s.name}
                      selected={draft.storeId === s.id}
                      onClick={() => setDraft({ ...draft, storeId: s.id })}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button disabled={busy} onClick={saveCell}>
                    保存
                  </Button>
                  {shiftOf(cell.staffId, cell.date) && (
                    <Button variant="danger" disabled={busy} onClick={deleteCell}>
                      休みにする（削除）
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => setCell(null)}>
                    閉じる
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* 報酬・交通費の自動計算 */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <SectionTitle className="flex-1">
                報酬・交通費（{monthLabelJa(month)}・自動計算）
              </SectionTitle>
              <Button
                variant="secondary"
                onClick={() => setShowPaySettings(!showPaySettings)}
              >
                {showPaySettings ? "設定を閉じる" : "時間給・交通費を設定"}
              </Button>
            </div>

            {payRows.length === 0 ? (
              <p className="text-sm text-muted">
                シフトを作成すると、時間給と店舗別交通費から報酬を自動計算します
              </p>
            ) : (
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full min-w-[680px] text-sm">
                  <thead>
                    <tr className="text-xs text-muted border-b border-hairline">
                      <th className="text-left py-2 font-semibold">スタッフ</th>
                      <th className="text-right font-semibold">稼働日数</th>
                      <th className="text-right font-semibold">稼働時間</th>
                      <th className="text-right font-semibold">時間給</th>
                      <th className="text-right font-semibold">交通費</th>
                      <th className="text-right font-semibold">報酬（税抜）</th>
                      <th className="text-right font-semibold">報酬（税込）</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {payRows.map((r) => (
                      <tr key={r.staff.id}>
                        <td className="py-2 text-ink whitespace-nowrap">
                          {staffLabel(r.staff)}
                        </td>
                        <td className="text-right tnum">{r.days}日</td>
                        <td className="text-right tnum">{fmtH(r.minutes)}</td>
                        <td className="text-right tnum">
                          {r.hourlyWage === null ? (
                            <Badge color="warn">未設定</Badge>
                          ) : (
                            yen(r.hourlyWage)
                          )}
                        </td>
                        <td className="text-right tnum">{yen(r.transport)}</td>
                        <td className="text-right tnum font-semibold text-ink">
                          {r.reward === null ? "—" : yen(r.reward)}
                        </td>
                        <td className="text-right tnum">
                          {r.rewardTaxed === null ? "—" : yen(r.rewardTaxed)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {transportWarnings.length > 0 && (
              <div className="space-y-1">
                {transportWarnings.map((w) => (
                  <p key={w} className="text-xs text-warn">
                    ⚠ {w}
                  </p>
                ))}
              </div>
            )}

            <p className="text-[11px] text-muted">
              稼働時間はドラフト・確定の全シフトが対象（実績が記録された日は実績時間）。
              交通費＝勤務店舗ごとの往復額 × 出勤日数。
              報酬（税抜）＝時間給 × 稼働時間 ＋ 交通費 ／
              報酬（税込）＝時間給 × 稼働時間 × {(1 + PAY_TAX_RATE).toFixed(1)} ＋
              交通費（交通費は実費のため非課税扱い）
            </p>

            {showPaySettings && (
              <div className="rounded-xl border border-gold/40 bg-gold-soft/30 p-3 space-y-3 fade-in">
                <p className="text-xs text-muted">
                  時間給と、店舗ごとの交通費（往復/日）を設定します。
                  空欄＝未設定（計算時に警告）。交通費がかからない店舗は「0」を入力してください。
                  この設定は管理者だけが閲覧・変更できます。
                </p>
                {staffList.map((st) => (
                  <PaySettingsRow
                    key={st.id}
                    staff={st}
                    stores={stores}
                    paySetting={paySettings.get(st.id)}
                    costs={transportCosts.filter((c) => c.staff_id === st.id)}
                    onSaved={load}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* 予定 vs 実績 */}
          <Card className="p-4 space-y-3">
            <SectionTitle>予定 vs 実績（{monthLabelJa(month)}）</SectionTitle>
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-xs text-muted border-b border-hairline">
                    <th className="text-left py-2 font-semibold">スタッフ</th>
                    <th className="text-right font-semibold">予定</th>
                    <th className="text-right font-semibold">実績</th>
                    <th className="text-right font-semibold">差分</th>
                    <th className="text-left pl-4 font-semibold">理由付き記録</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {planVsActual.map(({ staff, planned, actual, reasons }) => (
                    <tr key={staff.id}>
                      <td className="py-2 text-ink whitespace-nowrap">
                        {staffLabel(staff)}
                      </td>
                      <td className="text-right tnum">{fmtH(planned)}</td>
                      <td className="text-right tnum">{actual ? fmtH(actual) : "—"}</td>
                      <td
                        className={`text-right tnum ${
                          actual - planned > 0
                            ? "text-warn"
                            : actual && actual - planned < 0
                              ? "text-rose"
                              : "text-muted"
                        }`}
                      >
                        {actual ? `${actual - planned >= 0 ? "+" : ""}${fmtH(actual - planned)}` : "—"}
                      </td>
                      <td className="pl-4 text-xs text-muted">
                        {reasons.length === 0
                          ? "—"
                          : reasons.map((r) => (
                              <p key={r.date} className="tnum">
                                {Number(r.date.slice(8))}日: {r.reason}
                              </p>
                            ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted">
              実績はスタッフ本人が「マイシフト」から記録します（将来: 社労士提出用CSV出力に対応予定）
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

/* ================= 時間給・交通費の設定（スタッフ1人分） ================= */
function PaySettingsRow({
  staff,
  stores,
  paySetting,
  costs,
  onSaved,
}: {
  staff: Staff;
  stores: Store[];
  paySetting?: StaffPaySettings;
  costs: StaffTransportCost[];
  onSaved: () => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wage, setWage] = useState(paySetting ? String(paySetting.hourly_wage) : "");
  const [costDraft, setCostDraft] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    for (const s of stores) {
      const c = costs.find((x) => x.store_id === s.id);
      init[s.id] = c ? String(c.round_trip_cost) : "";
    }
    return init;
  });

  const inputCls =
    "w-28 min-h-10 rounded-lg border border-hairline bg-surface px-2 text-sm text-right tnum outline-none focus:border-gold";

  async function save() {
    setError(null);
    const wageTrim = wage.trim();
    if (wageTrim !== "" && !/^\d+$/.test(wageTrim)) {
      setError("時間給は0以上の整数（円）で入力してください");
      return;
    }
    for (const s of stores) {
      const v = (costDraft[s.id] ?? "").trim();
      if (v !== "" && !/^\d+$/.test(v)) {
        setError(`${s.name}の交通費は0以上の整数（円）で入力してください`);
        return;
      }
    }

    setBusy(true);
    // 時間給: 空欄は行削除（未設定に戻す）
    const wageRes =
      wageTrim === ""
        ? await supabase.from("staff_pay_settings").delete().eq("staff_id", staff.id)
        : await supabase
            .from("staff_pay_settings")
            .upsert(
              { staff_id: staff.id, hourly_wage: Number(wageTrim) },
              { onConflict: "staff_id" }
            );

    // 交通費: 店舗ごとに upsert（空欄は行削除で未設定に戻す）
    let err = wageRes.error;
    for (const s of stores) {
      if (err) break;
      const v = (costDraft[s.id] ?? "").trim();
      const res =
        v === ""
          ? await supabase
              .from("staff_transport_costs")
              .delete()
              .eq("staff_id", staff.id)
              .eq("store_id", s.id)
          : await supabase
              .from("staff_transport_costs")
              .upsert(
                { staff_id: staff.id, store_id: s.id, round_trip_cost: Number(v) },
                { onConflict: "staff_id,store_id" }
              );
      err = res.error;
    }

    if (err) {
      console.error(err);
      setError("保存に失敗しました（管理者権限が必要です）");
      setBusy(false);
      return;
    }
    await onSaved();
    setSaved(true);
    setBusy(false);
  }

  return (
    <div className="rounded-lg border border-hairline bg-surface p-3 space-y-2">
      <p className="text-sm font-semibold text-ink">{staffLabel(staff)}</p>
      <div className="flex items-end gap-3 flex-wrap">
        <label className="block">
          <span className="block text-xs font-semibold text-muted mb-1">時間給（円）</span>
          <input
            type="text"
            inputMode="numeric"
            value={wage}
            placeholder="未設定"
            onChange={(e) => {
              setWage(e.target.value);
              setSaved(false);
            }}
            className={inputCls}
          />
        </label>
        {stores.map((s) => (
          <label key={s.id} className="block">
            <span className="block text-xs font-semibold text-muted mb-1">
              {s.name} 交通費（往復/日）
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={costDraft[s.id] ?? ""}
              placeholder="未設定"
              onChange={(e) => {
                setCostDraft({ ...costDraft, [s.id]: e.target.value });
                setSaved(false);
              }}
              className={inputCls}
            />
          </label>
        ))}
        <Button disabled={busy} onClick={save}>
          保存
        </Button>
        {saved && <Badge color="ok">保存しました</Badge>}
      </div>
      {error && <p className="text-xs text-caution">{error}</p>}
    </div>
  );
}
