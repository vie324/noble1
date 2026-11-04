"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { Badge, Button, Card, ListSkeleton } from "@/components/ui";
import {
  PriorityBadge,
  TaskDetailSheet,
  TaskFormSheet,
  staffNameOf,
  useStaffList,
  useTaskActions,
} from "@/components/tasks";
import { dateLabelJa, jstToISO, todayJST } from "@/lib/format";
import { compareTasks, dueInfo, isMissingTableError, monthDayTime, TASKS_SETUP_MESSAGE } from "@/lib/tasks";
import type { Task } from "@/lib/types";

// トップページの「今日のToDo」
//   = 期日が今日まで（期限切れを含む）の未完了の業務 ＋ 今日完了した業務
//   未完了のものは翌日以降も「前日から持ち越し」として表示され続ける
//   表示するのは業務リストの閲覧権限がある人だけ（呼び出し側で判定。データも RLS で制限）
export function TodayTodo() {
  const { isAdmin, storeFilter } = useApp();
  const supabase = useMemo(() => createClient(), []);
  const staff = useStaffList();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [setupError, setSetupError] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const today = todayJST();

  const fetchTasks = useCallback(
    async () =>
      supabase
        .from("tasks")
        .select("*, task_notes (id, task_id, staff_id, kind, body, created_at)")
        .or(`and(status.neq.done,due_date.lte.${today}),completed_at.gte.${jstToISO(today, "00:00")}`),
    [supabase, today]
  );

  const apply = useCallback(
    ({ data, error }: { data: unknown; error: { code?: string; message?: string } | null }) => {
      if (error) console.error(error);
      setSetupError(isMissingTableError(error));
      setTasks(error ? [] : ((data as Task[]) ?? []));
    },
    []
  );

  const load = useCallback(async () => apply(await fetchTasks()), [apply, fetchTasks]);

  useEffect(() => {
    let cancelled = false;
    fetchTasks().then((r) => !cancelled && apply(r));
    return () => {
      cancelled = true;
    };
  }, [fetchTasks, apply]);

  const { setStatus, busyId } = useTaskActions(load);

  const visible = useMemo(
    () =>
      (tasks ?? [])
        .filter((t) => storeFilter === null || t.store_id === null || t.store_id === storeFilter)
        .sort(compareTasks),
    [tasks, storeFilter]
  );
  const remaining = visible.filter((t) => t.status !== "done").length;
  const opened = visible.find((t) => t.id === openId) ?? null;

  // 032 未適用: 管理者にだけ案内を出す
  if (setupError) {
    return isAdmin ? (
      <Card className="p-4">
        <p className="text-sm text-caution">{TASKS_SETUP_MESSAGE}</p>
      </Card>
    ) : null;
  }

  return (
    <section className="space-y-3" aria-labelledby="today-todo-title">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <h2 id="today-todo-title" className="serif text-3xl text-ink">
          今日のToDo
          <span className="ml-3 font-sans text-sm sm:text-base text-muted tnum">{dateLabelJa(today)}</span>
        </h2>
        {isAdmin && <Button onClick={() => setEditing("new")}>＋ ToDo追加</Button>}
      </div>

      <p className="flex items-center gap-2 rounded-xl border border-warn/25 bg-warn-soft/60 px-3 py-2 text-sm text-ink">
        <span className="text-warn" aria-hidden>
          ⓘ
        </span>
        未完了のToDoは翌日も継続表示されます
        {tasks !== null && remaining > 0 && (
          <span className="ml-auto text-xs font-semibold text-warn whitespace-nowrap">残り {remaining}件</span>
        )}
      </p>

      {tasks === null ? (
        <ListSkeleton rows={3} />
      ) : (
        <Card className="overflow-hidden">
          <div
            className="hidden md:grid grid-cols-[3.5rem_minmax(0,1fr)_11rem] gap-3 px-4 py-2 bg-base border-b border-hairline text-xs font-semibold text-muted"
            aria-hidden
          >
            <span className="text-center">完了</span>
            <span>やること</span>
            <span>期限・対応者</span>
          </div>
          {visible.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">今日のToDoはありません</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {visible.map((t) => {
                const done = t.status === "done";
                const due = dueInfo(t, today);
                const carried = !done && t.due_date !== null && t.due_date < today;
                return (
                  <li
                    key={t.id}
                    className="grid grid-cols-[2.75rem_minmax(0,1fr)] md:grid-cols-[3.5rem_minmax(0,1fr)_11rem] gap-x-2 md:gap-x-3 items-start md:items-center px-2 md:px-4 py-2"
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={done}
                      aria-label={`${t.title}を${done ? "未完了に戻す" : "完了にする"}`}
                      disabled={busyId === t.id}
                      onClick={() => setStatus(t, done ? "todo" : "done")}
                      className="min-h-11 min-w-11 inline-flex items-center justify-center md:mx-auto disabled:opacity-40"
                    >
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-md border-2 text-sm font-bold transition-colors ${
                          done ? "bg-gold-dk border-gold-dk text-white" : "bg-surface border-hairline hover:border-gold"
                        }`}
                        aria-hidden
                      >
                        {done ? "✓" : ""}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOpenId(t.id)}
                      className="min-h-11 text-left min-w-0 py-1.5"
                    >
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className={done ? "text-muted line-through" : "text-ink font-medium"}>{t.title}</span>
                        {carried && <Badge color="caution">前日から持ち越し</Badge>}
                        {!done && t.priority === "high" && <PriorityBadge priority="high" />}
                      </span>
                      {/* スマホ: 期限・対応者は本文の下に */}
                      <span className="md:hidden block text-xs mt-0.5">
                        <TodoMeta task={t} dueLabel={due.label} overdue={due.tone === "overdue"} staffName={(id) => staffNameOf(staff, id)} />
                      </span>
                    </button>

                    <div className="hidden md:block text-sm">
                      <TodoMeta task={t} dueLabel={due.label} overdue={due.tone === "overdue"} staffName={(id) => staffNameOf(staff, id)} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      <p className="flex items-center justify-between gap-2 flex-wrap text-xs text-muted">
        <span>※ チェックすると対応者・完了日時を記録します</span>
        <Link href="/tasks" className="text-gold-dk font-semibold hover:underline underline-offset-2">
          業務リストを見る ›
        </Link>
      </p>

      <TaskDetailSheet
        task={opened}
        staff={staff}
        onClose={() => setOpenId(null)}
        onChanged={load}
        onEdit={(t) => {
          setOpenId(null);
          setEditing(t);
        }}
      />
      <TaskFormSheet
        open={editing !== null}
        initial={editing === "new" ? null : editing}
        defaults={{ list: "short", due_date: today, priority: "mid" }}
        staff={staff}
        onClose={() => setEditing(null)}
        onSaved={load}
      />
    </section>
  );
}

function TodoMeta({
  task,
  dueLabel,
  overdue,
  staffName,
}: {
  task: Task;
  dueLabel: string;
  overdue: boolean;
  staffName: (id: number | null) => string;
}) {
  if (task.status === "done") {
    return (
      <span className="text-muted">
        対応：{staffName(task.completed_by)}
        {task.completed_at && <span className="tnum md:block"> {monthDayTime(task.completed_at)}完了</span>}
      </span>
    );
  }
  return (
    <span>
      <span className={overdue ? "text-caution font-semibold tnum" : "text-ink tnum"}>{dueLabel}</span>
      {task.status === "doing" && task.started_by !== null ? (
        <span className="text-info md:block"> 対応中：{staffName(task.started_by)}</span>
      ) : task.assignee_id !== null ? (
        <span className="text-muted md:block"> 担当：{staffName(task.assignee_id)}</span>
      ) : null}
    </span>
  );
}
