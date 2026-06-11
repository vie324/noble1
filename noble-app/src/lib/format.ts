// 日付・金額フォーマット（タイムゾーンは Asia/Tokyo 固定）

const TZ = "Asia/Tokyo";

export function yen(amount: number): string {
  return `¥${Math.round(amount).toLocaleString("ja-JP")}`;
}

// "2026-06-11" 形式（Asia/Tokyo の今日）
export function todayJST(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date());
}

// "2026/06/11"
export function dateSlash(iso: string | Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

// "6月11日(木)"
export function dateLabelJa(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00+09:00`);
  const weekday = new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, weekday: "short" }).format(d);
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: TZ,
    month: "long",
    day: "numeric",
  }).format(d);
  return `${parts}(${weekday})`;
}

// "10:00"
export function timeHM(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

// "2026/06/11 10:00"
export function dateTimeLabel(iso: string): string {
  return `${dateSlash(iso)} ${timeHM(iso)}`;
}

// 日付文字列 "YYYY-MM-DD" を n 日ずらす
export function addDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(d);
}

// "YYYY-MM-DD" + "HH:mm"（東京時間）→ ISO 文字列
export function jstToISO(isoDate: string, hm: string): string {
  return new Date(`${isoDate}T${hm}:00+09:00`).toISOString();
}

// 今月の月初 "YYYY-MM-01"（東京時間）
export function thisMonthJST(): string {
  return `${todayJST().slice(0, 7)}-01`;
}

// 月初日付を n ヶ月ずらす
export function addMonths(monthFirst: string, n: number): string {
  const [y, m] = monthFirst.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

// "2026年6月"
export function monthLabelJa(monthFirst: string): string {
  const [y, m] = monthFirst.split("-").map(Number);
  return `${y}年${m}月`;
}

// "10:00:00"/"10:00" → "10"、"10:30:00" → "10:30"（TimeTree式チップ用の短縮表記）
export function timeShort(t: string): string {
  const [h, m] = t.split(":");
  return m === "00" ? String(Number(h)) : `${Number(h)}:${m}`;
}

// "🐨 10-19" 形式のチップラベル
export function shiftChipLabel(emoji: string, start: string, end: string): string {
  return `${emoji} ${timeShort(start)}-${timeShort(end)}`;
}

// "HH:MM(:SS)" → 分
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"];

// 回数券の表示名 例: "5回券（2026/01/15購入）"
export function ticketLabel(t: {
  purchased_at: string;
  ticket_products?: { name: string } | null;
}): string {
  const name = t.ticket_products?.name ?? "回数券";
  return `${name}（${dateSlash(t.purchased_at)}購入）`;
}

// 有効期限までの残日数（東京時間の日付基準）
export function daysUntil(isoDate: string): number {
  const today = new Date(`${todayJST()}T00:00:00+09:00`).getTime();
  const target = new Date(`${isoDate}T00:00:00+09:00`).getTime();
  return Math.round((target - today) / 86400000);
}
