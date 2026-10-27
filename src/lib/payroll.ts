// 報酬・交通費の計算と、社労士・税理士向け CSV の行データ
//   シフト管理（作成中の見込み）と月締め・給与連携（確定）の両方で使う

import { addMonths, thisMonthJST, timeToMinutes, todayJST, WEEKDAYS_JA } from "@/lib/format";
import { PAY_TAX_RATE } from "@/lib/types";
import type {
  AttendanceRecord,
  Shift,
  Staff,
  StaffPaySettings,
  StaffTransportCost,
} from "@/lib/types";

export const buildAttMap = (attendance: AttendanceRecord[]) =>
  new Map(attendance.map((a) => [a.shift_id, a]));

export const buildCostMap = (costs: StaffTransportCost[]) =>
  new Map(costs.map((c) => [`${c.staff_id}:${c.store_id}`, c.round_trip_cost]));

// 1シフトの稼働分数（実績があれば実績、なければ予定）
export function shiftMinutes(s: Shift, a: AttendanceRecord | undefined): number {
  return a
    ? timeToMinutes(a.actual_end) - timeToMinutes(a.actual_start)
    : timeToMinutes(s.end_time) - timeToMinutes(s.start_time);
}

export interface PayRow {
  staff: Staff;
  days: number;
  minutes: number;
  hourlyWage: number | null;
  transport: number;
  missingStores: number[];
  reward: number | null; // 税抜（時間給 × 稼働時間 ＋ 交通費）
  rewardTaxed: number | null; // 税込（時間給 × 稼働時間 × 1.1 ＋ 交通費）
}

// 報酬計算（1スタッフ分）。実績が記録された日は実績時間、なければ予定時間。
// 交通費はその日の勤務店舗に設定された往復額を日数分積算する
export function calcPayFor(
  st: Staff,
  own: Shift[],
  att: Map<number, AttendanceRecord>,
  costByStaffStore: Map<string, number>,
  hourlyWage: number | null
): PayRow {
  let minutes = 0;
  let transport = 0;
  const missingStores = new Set<number>();
  for (const s of own) {
    minutes += shiftMinutes(s, att.get(s.id));
    const cost = costByStaffStore.get(`${st.id}:${s.store_id}`);
    if (cost == null) missingStores.add(s.store_id);
    else transport += cost;
  }
  const wagePart = hourlyWage === null ? null : Math.round((hourlyWage * minutes) / 60);
  return {
    staff: st,
    days: own.length,
    minutes,
    hourlyWage,
    transport,
    missingStores: [...missingStores],
    reward: wagePart === null ? null : wagePart + transport,
    rewardTaxed:
      wagePart === null ? null : Math.round(wagePart * (1 + PAY_TAX_RATE)) + transport,
  };
}

// 確定シフトだけでスタッフごとの報酬を計算（月締め・CSV 用）
export function confirmedPayRows(
  staffList: Staff[],
  shifts: Shift[],
  attendance: AttendanceRecord[],
  costs: StaffTransportCost[],
  paySettings: Map<number, StaffPaySettings>
): PayRow[] {
  const att = buildAttMap(attendance);
  const cost = buildCostMap(costs);
  return staffList
    .map((st) =>
      calcPayFor(
        st,
        shifts.filter((s) => s.staff_id === st.id && s.status === "confirmed"),
        att,
        cost,
        paySettings.get(st.id)?.hourly_wage ?? null
      )
    )
    .filter((r) => r.days > 0);
}

// 勤務実績CSV（社労士向け・確定シフトのみ）
export function attendanceCsvRows(
  shifts: Shift[],
  attendance: AttendanceRecord[],
  staffList: Staff[],
  storeName: (id: number) => string
): (string | number)[][] {
  const rows: (string | number)[][] = [
    [
      "日付",
      "曜日",
      "スタッフ",
      "店舗",
      "予定始業",
      "予定終業",
      "実績始業",
      "実績終業",
      "実働時間(h)",
      "予定との差異理由",
      "本人確認",
    ],
  ];
  const att = buildAttMap(attendance);
  const confirmed = [...shifts]
    .filter((s) => s.status === "confirmed")
    .sort((a, b) => (a.date === b.date ? a.staff_id - b.staff_id : a.date < b.date ? -1 : 1));
  for (const s of confirmed) {
    const st = staffList.find((x) => x.id === s.staff_id);
    const a = att.get(s.id);
    const w = new Date(`${s.date}T12:00:00+09:00`).getUTCDay();
    rows.push([
      s.date,
      WEEKDAYS_JA[w],
      st?.name ?? "",
      storeName(s.store_id),
      s.start_time.slice(0, 5),
      s.end_time.slice(0, 5),
      a ? a.actual_start.slice(0, 5) : "",
      a ? a.actual_end.slice(0, 5) : "",
      Math.round((shiftMinutes(s, a) / 60) * 100) / 100,
      a?.diff_reason ?? "",
      s.acknowledged_at ? "済" : "",
    ]);
  }
  return rows;
}

// 報酬・交通費CSV（税理士向け・確定シフトのみ）
export function payCsvRows(payRows: PayRow[]): (string | number)[][] {
  const rows: (string | number)[][] = [
    [
      "スタッフ",
      "雇用区分",
      "稼働日数",
      "稼働時間(h)",
      "時間給(円)",
      "交通費(円)",
      "報酬(税抜・円)",
      "消費税(円)",
      "報酬(税込・円)",
    ],
  ];
  const typeLabel = { employee: "正社員", part_time: "パート・アルバイト", contractor: "業務委託" } as const;
  for (const r of payRows) {
    rows.push([
      r.staff.name,
      r.staff.employment_type ? typeLabel[r.staff.employment_type] : "",
      r.days,
      Math.round((r.minutes / 60) * 100) / 100,
      r.hourlyWage ?? "",
      r.transport,
      r.reward ?? "",
      r.reward === null || r.rewardTaxed === null ? "" : r.rewardTaxed - r.reward,
      r.rewardTaxed ?? "",
    ]);
  }
  return rows;
}

// 実績が未記録の、今日までの確定シフト
export function missingAttendance(shifts: Shift[], attendance: AttendanceRecord[]): Shift[] {
  const today = todayJST();
  const recorded = new Set(attendance.map((a) => a.shift_id));
  return shifts.filter((s) => s.status === "confirmed" && s.date <= today && !recorded.has(s.id));
}

// 月締め画面の初期表示: 締めていない前月があれば前月、なければ今月
export function defaultCloseMonth(closedMonths: string[]): string {
  const prev = addMonths(thisMonthJST(), -1);
  return closedMonths.includes(prev) ? thisMonthJST() : prev;
}
