// 業務リスト・今日のToDo の共通処理（並び順・期日の表示・対応者の表示）

import { addDays } from "@/lib/format";
import { TASK_PRIORITY_META } from "@/lib/types";
import type { Staff, Task, TaskNote } from "@/lib/types";

// 業務リストを閲覧できるか（管理者は常に可）
export function canViewTasks(s: Pick<Staff, "role" | "can_view_tasks"> | null | undefined): boolean {
  return !!s && (s.role === "admin" || s.can_view_tasks === true);
}

// "11/4"
export function monthDay(isoDate: string): string {
  return `${Number(isoDate.slice(5, 7))}/${Number(isoDate.slice(8, 10))}`;
}

// "11/2 10:15"（東京時間）
export function monthDayTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

// 今週中＝次の日曜（今日が日曜なら今日）
export function endOfWeek(today: string): string {
  const w = new Date(`${today}T12:00:00+09:00`).getUTCDay();
  return addDays(today, (7 - w) % 7);
}

export type DueTone = "none" | "overdue" | "today" | "soon" | "normal";

// 期日の表示（未完了で期日を過ぎたら「期限切れ」、今日なら「本日中」）
export function dueInfo(task: Pick<Task, "due_date" | "status">, today: string): { label: string; tone: DueTone } {
  if (!task.due_date) return { label: "期日なし", tone: "none" };
  if (task.status !== "done") {
    if (task.due_date < today) return { label: `${monthDay(task.due_date)} 期限`, tone: "overdue" };
    if (task.due_date === today) return { label: "本日中", tone: "today" };
    if (task.due_date <= addDays(today, 2)) return { label: monthDay(task.due_date), tone: "soon" };
  }
  return { label: monthDay(task.due_date), tone: "normal" };
}

// 未完了: 期日の近い順（期日なしは最後）→ 優先度 → 登録順 / 完了: 完了日時の新しい順
export function compareTasks(a: Task, b: Task): number {
  const aDone = a.status === "done";
  const bDone = b.status === "done";
  if (aDone !== bDone) return aDone ? 1 : -1;
  if (aDone && bDone) return (b.completed_at ?? "").localeCompare(a.completed_at ?? "");
  if (a.due_date !== b.due_date) {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  }
  const pr = TASK_PRIORITY_META[a.priority].rank - TASK_PRIORITY_META[b.priority].rank;
  if (pr !== 0) return pr;
  return a.created_at.localeCompare(b.created_at);
}

// 一覧に出すメモ（最新のメモ。なければ管理者の補足）
export function latestMemo(task: Task): string | null {
  const memos = (task.task_notes ?? []).filter((n: TaskNote) => n.kind === "memo");
  if (memos.length > 0) {
    const last = memos.reduce((x, y) => (x.created_at > y.created_at ? x : y));
    return last.body;
  }
  return task.description?.trim() || null;
}

// テーブル未作成（032 未適用）のエラーかどうか
export function isMissingTableError(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  return e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? "");
}

export const TASKS_SETUP_MESSAGE =
  "業務リストを使うには、Supabase の SQL Editor で supabase/migrations/032_tasks.sql を実行してください";
