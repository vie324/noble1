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
