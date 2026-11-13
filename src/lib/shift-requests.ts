// シフト希望の受付（締切の表示など）の共通処理
import { dateLabelJa, todayJST } from "@/lib/format";

// 今日から締切日までの日数（今日が締切なら 0、過ぎていればマイナス）
export function daysUntil(isoDate: string): number {
  const a = new Date(`${todayJST()}T00:00:00+09:00`).getTime();
  const b = new Date(`${isoDate}T00:00:00+09:00`).getTime();
  return Math.round((b - a) / 86400000);
}

// "11月20日(金)・あと3日" / "11月20日(金)・今日まで" / "11月20日(金)・締切を過ぎています"
export function deadlineLabel(isoDate: string): string {
  const n = daysUntil(isoDate);
  const tail = n > 0 ? `あと${n}日` : n === 0 ? "今日まで" : "締切を過ぎています";
  return `${dateLabelJa(isoDate)}・${tail}`;
}
