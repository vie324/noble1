"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { useToast } from "@/components/toast";
import { Button, Card, Chip, ChipRow, EmptyState, ListSkeleton, SectionTitle } from "@/components/ui";
import {
  DueText,
  PriorityBadge,
  StatusBadge,
  TaskDetailSheet,
  TaskFormSheet,
  staffNameOf,
  useStaffList,
  useTaskActions,
} from "@/components/tasks";
import { staffLabel, todayJST } from "@/lib/format";
import {
  compareTasks,
  isMissingTableError,
  latestMemo,
  monthDayTime,
  TASKS_SETUP_MESSAGE,
} from "@/lib/tasks";
import { TASK_LIST_META } from "@/lib/types";
import type { Staff, Task, TaskList } from "@/lib/types";

type Filter = "open" | "mine" | "done";

const NOTES_SELECT = "*, task_notes (id, task_id, staff_id, kind, body, created_at)";

// 業務リスト（施術以外のやること）。閲覧は管理者と許可されたスタッフのみ（layout と RLS で制限）
export default function TasksPage() {
  const { me, isAdmin, storeFilter, storeName } = useApp();
  const supabase = useMemo(() => createClient(), []);
  const staffList = useStaffList();
  const [staffOverride, setStaffOverride] = useState<Staff[] | null>(null);
  const staff = staffOverride ?? staffList;
  const [filter, setFilter] = useState<Filter>("open");
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [setupError, setSetupError] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const today = todayJST();

  const fetchTasks = useCallback(async () => {
    let q = supabase.from("tasks").select(NOTES_SELECT);
    if (filter === "done") {
      q = q.eq("status", "done").order("completed_at", { ascending: false }).limit(100);
    } else {
      q = q.neq("status", "done");
      if (filter === "mine") q = q.or(`assignee_id.eq.${me.id},started_by.eq.${me.id}`);
    }
    return q;
  }, [supabase, filter, me.id]);

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

  function changeFilter(f: Filter) {
    if (f === filter) return;
    setTasks(null);
    setFilter(f);
  }

  // 店舗切替: 全店舗の業務＋選んだ店舗の業務
  const visible = useMemo(
    () =>
      (tasks ?? [])
        .filter((t) => storeFilter === null || t.store_id === null || t.store_id === storeFilter)
        .sort(compareTasks),
    [tasks, storeFilter]
  );

  const opened = visible.find((t) => t.id === openId) ?? null;

  return (
    <div className="space-y-5 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="serif text-3xl text-ink">業務リスト</h1>
          <p className="text-sm text-muted mt-1">
            施術以外のやること・{storeName(storeFilter)}。空き時間に確認して、対応できる仕事を進めてください
          </p>
        </div>
        {isAdmin && <Button onClick={() => setEditing("new")}>＋ 業務を追加</Button>}
      </div>

      <ChipRow>
        <Chip label="未完了" selected={filter === "open"} onClick={() => changeFilter("open")} />
        <Chip label="自分の担当・対応中" selected={filter === "mine"} onClick={() => changeFilter("mine")} />
        <Chip label="完了済み" selected={filter === "done"} onClick={() => changeFilter("done")} />
      </ChipRow>

      {setupError ? (
        <Card className="p-4">
          <p className="text-sm text-caution">{TASKS_SETUP_MESSAGE}</p>
        </Card>
      ) : tasks === null ? (
        <ListSkeleton rows={6} />
      ) : (
        (Object.keys(TASK_LIST_META) as TaskList[]).map((list) => (
          <TaskListCard
            key={list}
            list={list}
            tasks={visible.filter((t) => t.list === list)}
            staff={staff}
            today={today}
            filter={filter}
            onOpen={(t) => setOpenId(t.id)}
            onChanged={load}
          />
        ))
      )}

      <p className="text-xs text-muted">
        ※ 業務内容・期日・優先度・担当者は管理者が設定します。対応を始めたら「対応開始」、終わったら「完了」を押すと、
        対応者と日時が記録されます。期日が来た業務はトップページの「今日のToDo」にも表示されます。
      </p>

      {isAdmin && staff && (
        <PermissionCard staff={staff} onUpdated={(next) => setStaffOverride(next)} />
      )}

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
        staff={staff}
        onClose={() => setEditing(null)}
        onSaved={load}
      />
    </div>
  );
}

/* ---------------- 一覧（日々・週単位 / 長期） ---------------- */
function TaskListCard({
  list,
  tasks,
  staff,
  today,
  filter,
  onOpen,
  onChanged,
}: {
  list: TaskList;
  tasks: Task[];
  staff: Staff[] | null;
  today: string;
  filter: Filter;
  onOpen: (t: Task) => void;
  onChanged: () => Promise<void>;
}) {
  const meta = TASK_LIST_META[list];
  return (
    <Card className="overflow-hidden">
      <div className="px-4 pt-4 pb-3 flex items-baseline gap-3 flex-wrap">
        <h2 className="serif text-xl text-ink">{meta.label}</h2>
        <p className="text-xs text-muted">{meta.note}</p>
      </div>
      {tasks.length === 0 ? (
        <div className="border-t border-hairline">
          <EmptyState
            message={filter === "done" ? "完了した業務はまだありません" : "未完了の業務はありません"}
          />
        </div>
      ) : (
        <>
          <div
            className="hidden md:grid grid-cols-[minmax(0,1fr)_6.5rem_4.5rem_10rem] gap-3 px-4 py-2 bg-base border-y border-hairline text-xs font-semibold text-muted"
            aria-hidden
          >
            <span>業務内容・メモ</span>
            <span className="text-center">期日</span>
            <span className="text-center">優先度</span>
            <span className="text-center">状況</span>
          </div>
          <ul className="divide-y divide-hairline max-md:border-t max-md:border-hairline">
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} staff={staff} today={today} onOpen={() => onOpen(t)} onChanged={onChanged} />
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function TaskRow({
  task,
  staff,
  today,
  onOpen,
  onChanged,
}: {
  task: Task;
  staff: Staff[] | null;
  today: string;
  onOpen: () => void;
  onChanged: () => Promise<void>;
}) {
  const { storeName } = useApp();
  const { setStatus, busyId } = useTaskActions(onChanged);
  const memo = latestMemo(task);
  const busy = busyId === task.id;

  return (
    <li className="px-4 py-3 md:grid md:grid-cols-[minmax(0,1fr)_6.5rem_4.5rem_10rem] md:gap-3 md:items-center">
      <button type="button" onClick={onOpen} className="block w-full text-left min-w-0 group">
        <span className="block font-semibold text-ink group-hover:text-gold-dk transition-colors">{task.title}</span>
        <span className={`block text-xs truncate mt-0.5 ${memo ? "text-muted" : "text-gold-dk"}`}>
          {memo ? `メモ：${memo}` : "＋ メモを追加"}
        </span>
        {(task.assignee_id !== null || task.store_id !== null) && (
          <span className="block text-[11px] text-muted mt-0.5">
            {task.assignee_id !== null && `担当：${staffNameOf(staff, task.assignee_id)}`}
            {task.assignee_id !== null && task.store_id !== null && " ・ "}
            {task.store_id !== null && storeName(task.store_id)}
          </span>
        )}
      </button>

      {/* スマホは1行にまとめ、PCは表の列として並べる */}
      <div className="flex items-center gap-2 flex-wrap mt-2 md:mt-0 md:contents">
        <span className="text-sm md:text-center">
          <span className="md:hidden text-xs text-muted mr-1">期日</span>
          <DueText task={task} today={today} />
        </span>
        <span className="md:flex md:justify-center">
          <PriorityBadge priority={task.priority} />
        </span>
        <div className="ml-auto md:ml-0 flex items-center gap-2 md:flex-col md:gap-1 md:text-center">
          <StatusBadge status={task.status} />
          {task.status === "doing" && task.started_by !== null && (
            <span className="text-[11px] text-muted">{staffNameOf(staff, task.started_by)}</span>
          )}
          {task.status === "done" && task.completed_at && (
            <span className="text-[11px] text-muted">
              {staffNameOf(staff, task.completed_by)} {monthDayTime(task.completed_at)}
            </span>
          )}
          {task.status === "todo" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setStatus(task, "doing")}
              className="min-h-10 px-3 rounded-full border border-info/40 text-info text-xs font-semibold hover:bg-info-soft disabled:opacity-40"
            >
              対応開始
            </button>
          )}
          {task.status === "doing" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setStatus(task, "done")}
              className="min-h-10 px-3 rounded-full border border-ok/40 text-ok text-xs font-semibold hover:bg-ok-soft disabled:opacity-40"
            >
              完了にする
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/* ---------------- 閲覧権限（管理者がスタッフごとに付与・解除） ---------------- */
function PermissionCard({ staff, onUpdated }: { staff: Staff[]; onUpdated: (next: Staff[]) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const notify = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);
  const members = staff.filter((s) => s.role !== "admin");
  const admins = staff.filter((s) => s.role === "admin");

  async function toggle(s: Staff) {
    const next = !s.can_view_tasks;
    setBusyId(s.id);
    const { error } = await supabase.from("staff").update({ can_view_tasks: next }).eq("id", s.id);
    setBusyId(null);
    if (error) {
      notify(
        /can_view_tasks/.test(error.message) ? TASKS_SETUP_MESSAGE : `変更できませんでした（${error.message}）`,
        "error"
      );
      return;
    }
    onUpdated(staff.map((x) => (x.id === s.id ? { ...x, can_view_tasks: next } : x)));
    notify(`${s.name}さんの閲覧を${next ? "許可" : "解除"}しました`);
  }

  return (
    <Card className="p-4 space-y-3">
      <SectionTitle>業務リストの閲覧権限</SectionTitle>
      <p className="text-sm text-muted">
        許可したスタッフだけが「業務」タブとトップページの「今日のToDo」を見られます。
        許可していないスタッフは URL を直接開いても表示されません。
        管理者（{admins.map((a) => a.name).join("・") || "—"}）は常に閲覧できます。
      </p>
      {members.length === 0 ? (
        <p className="text-sm text-muted">スタッフが登録されていません</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {members.map((s) => {
            const on = s.can_view_tasks === true;
            return (
              <li key={s.id} className="flex items-center gap-3 py-2">
                <span className="flex-1 min-w-0 text-sm text-ink truncate">{staffLabel(s)}</span>
                <span className={`text-xs ${on ? "text-ok font-semibold" : "text-muted"}`}>
                  {on ? "閲覧できる" : "閲覧不可"}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${s.name}さんの閲覧権限`}
                  disabled={busyId === s.id}
                  onClick={() => toggle(s)}
                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${
                    on ? "bg-ok" : "bg-hairline"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      on ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
