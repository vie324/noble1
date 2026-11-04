"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { Button, Chip, TextArea, TextField } from "@/components/ui";
import { staffLabel, todayJST, addDays } from "@/lib/format";
import {
  canViewTasks,
  dueInfo,
  endOfWeek,
  isMissingTableError,
  monthDayTime,
  TASKS_SETUP_MESSAGE,
} from "@/lib/tasks";
import { TASK_LIST_META, TASK_PRIORITY_META, TASK_STATUS_META } from "@/lib/types";
import type { Staff, Task, TaskList, TaskPriority, TaskStatus } from "@/lib/types";

/* ---------------- スタッフ一覧（担当者・対応者の表示用） ---------------- */
export function useStaffList(): Staff[] | null {
  const [staff, setStaff] = useState<Staff[] | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await createClient()
        .from("staff")
        .select("*")
        .eq("is_active", true)
        .order("id");
      setStaff((data as Staff[]) ?? []);
    })();
  }, []);
  return staff;
}

export function staffNameOf(staff: Staff[] | null, id: number | null | undefined): string {
  if (id == null) return "";
  const s = staff?.find((x) => x.id === id);
  return s ? staffLabel(s) : "（退職したスタッフ）";
}

/* ---------------- バッジ ---------------- */
const pill = "inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap";

const priorityClass: Record<TaskPriority, string> = {
  high: "bg-caution-soft text-caution border-caution/30",
  mid: "bg-warn-soft text-warn border-warn/30",
  low: "bg-base text-muted border-hairline",
};

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span className={`${pill} min-w-10 ${priorityClass[priority]}`} title="優先度">
      {TASK_PRIORITY_META[priority].label}
    </span>
  );
}

const statusClass: Record<TaskStatus, string> = {
  todo: "bg-base text-muted border-hairline",
  doing: "bg-info-soft text-info border-info/30",
  done: "bg-ok-soft text-ok border-ok/30",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`${pill} min-w-14 ${statusClass[status]}`}>{TASK_STATUS_META[status].label}</span>;
}

export function DueText({ task, today }: { task: Task; today: string }) {
  const d = dueInfo(task, today);
  const cls =
    d.tone === "overdue"
      ? "text-caution font-semibold"
      : d.tone === "today"
        ? "text-warn font-semibold"
        : d.tone === "none"
          ? "text-muted text-xs"
          : "text-ink";
  return <span className={`tnum ${cls}`}>{d.label}</span>;
}

/* ---------------- 対応状況の変更（スタッフ・管理者） ---------------- */
export function useTaskActions(onChanged: () => Promise<void> | void) {
  const supabase = useMemo(() => createClient(), []);
  const notify = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);

  async function setStatus(task: Task, status: TaskStatus) {
    setBusyId(task.id);
    const { error } = await supabase.rpc("set_task_status", { p_task_id: task.id, p_status: status });
    if (error) {
      notify(isMissingTableError(error) ? TASKS_SETUP_MESSAGE : `更新できませんでした（${error.message}）`, "error");
    } else {
      notify(
        status === "doing"
          ? `「${task.title}」の対応を開始しました`
          : status === "done"
            ? `「${task.title}」を完了にしました`
            : `「${task.title}」を未着手に戻しました`
      );
      await onChanged();
    }
    setBusyId(null);
  }

  return { setStatus, busyId };
}

/* ---------------- 業務の追加・編集（管理者） ---------------- */
export function TaskFormSheet({
  open,
  initial,
  defaults,
  staff,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: Task | null;
  defaults?: Partial<Pick<Task, "list" | "due_date" | "priority">>;
  staff: Staff[] | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  if (!open) return null;
  return (
    <TaskFormInner
      key={initial?.id ?? "new"}
      initial={initial}
      defaults={defaults}
      staff={staff}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function TaskFormInner({
  initial,
  defaults,
  staff,
  onClose,
  onSaved,
}: {
  initial: Task | null;
  defaults?: Partial<Pick<Task, "list" | "due_date" | "priority">>;
  staff: Staff[] | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { stores } = useApp();
  const supabase = useMemo(() => createClient(), []);
  const notify = useToast();
  const today = todayJST();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [list, setList] = useState<TaskList>(initial?.list ?? defaults?.list ?? "short");
  const [due, setDue] = useState<string>(initial ? initial.due_date ?? "" : defaults?.due_date ?? "");
  const [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? defaults?.priority ?? "mid");
  const [assigneeId, setAssigneeId] = useState<number | null>(initial?.assignee_id ?? null);
  const [storeId, setStoreId] = useState<number | null>(initial?.store_id ?? null);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [busy, setBusy] = useState(false);

  // 担当にできるのは業務リストを閲覧できる人だけ（見えない業務を割り当てないため）
  const assignable = (staff ?? []).filter((s) => canViewTasks(s));
  const quickDue: [string, string][] = [
    ["今日", today],
    ["明日", addDays(today, 1)],
    ["今週中（日）", endOfWeek(today)],
  ];

  async function save() {
    if (!title.trim()) return;
    setBusy(true);
    const payload = {
      title: title.trim(),
      list,
      due_date: due || null,
      priority,
      assignee_id: assigneeId,
      store_id: storeId,
      description: description.trim() || null,
    };
    const { error } = initial
      ? await supabase.from("tasks").update(payload).eq("id", initial.id)
      : await supabase.from("tasks").insert(payload);
    setBusy(false);
    if (error) {
      notify(isMissingTableError(error) ? TASKS_SETUP_MESSAGE : `保存できませんでした（${error.message}）`, "error");
      return;
    }
    notify(initial ? "業務を更新しました" : "業務を追加しました");
    await onSaved();
    onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={initial ? "業務を編集" : "業務を追加"}
      footer={
        <div className="flex gap-2 pb-3">
          <Button variant="ghost" onClick={onClose} className="flex-1">
            キャンセル
          </Button>
          <Button onClick={save} disabled={busy || !title.trim()} className="flex-[2]">
            {busy ? "保存中…" : initial ? "保存する" : "追加する"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <TextField
          label="業務内容"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: ブログの作成 / 備品の発注内容を確認"
          autoFocus={!initial}
        />

        <div>
          <p className="text-xs font-semibold text-muted mb-1.5">区分</p>
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(TASK_LIST_META) as TaskList[]).map((l) => (
              <Chip key={l} label={TASK_LIST_META[l].label} selected={list === l} onClick={() => setList(l)} />
            ))}
          </div>
          <p className="text-[11px] text-muted mt-1">{TASK_LIST_META[list].note}</p>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted mb-1.5">期日</p>
          <div className="flex gap-2 flex-wrap items-center">
            {quickDue.map(([label, d]) => (
              <Chip key={label} label={label} selected={due === d} onClick={() => setDue(d)} />
            ))}
            <Chip label="期日なし" selected={due === ""} onClick={() => setDue("")} />
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              aria-label="期日を選ぶ"
              className="min-h-11 rounded-lg border border-hairline bg-surface px-2 text-sm text-ink outline-none focus:border-gold"
            />
          </div>
          <p className="text-[11px] text-muted mt-1">
            期日が来ると、トップページの「今日のToDo」に表示されます（完了するまで翌日以降も表示）
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted mb-1.5">優先度</p>
          <div className="flex gap-2">
            {(Object.keys(TASK_PRIORITY_META) as TaskPriority[]).map((p) => (
              <Chip key={p} label={TASK_PRIORITY_META[p].label} selected={priority === p} onClick={() => setPriority(p)} />
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted mb-1.5">担当者</p>
          <div className="flex gap-2 flex-wrap">
            <Chip label="指定なし（誰でも）" selected={assigneeId === null} onClick={() => setAssigneeId(null)} />
            {assignable.map((s) => (
              <Chip key={s.id} label={staffLabel(s)} selected={assigneeId === s.id} onClick={() => setAssigneeId(s.id)} />
            ))}
          </div>
          <p className="text-[11px] text-muted mt-1">担当にできるのは、業務リストの閲覧を許可したスタッフです</p>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted mb-1.5">店舗</p>
          <div className="flex gap-2 flex-wrap">
            <Chip label="全店舗" selected={storeId === null} onClick={() => setStoreId(null)} />
            {stores.map((s) => (
              <Chip key={s.id} label={s.name} selected={storeId === s.id} onClick={() => setStoreId(s.id)} />
            ))}
          </div>
        </div>

        <TextArea
          label="補足（やり方・注意点など。任意）"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="例: テーマと下書きを掲示板で共有してから投稿"
        />
      </div>
    </Sheet>
  );
}

/* ---------------- 業務の詳細（メモ・対応履歴・対応開始／完了） ---------------- */
export function TaskDetailSheet(props: {
  task: Task | null;
  staff: Staff[] | null;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  onEdit: (task: Task) => void;
}) {
  // 別の業務を開いたら入力中のメモなどをリセットする
  if (!props.task) return null;
  return <TaskDetailInner key={props.task.id} {...props} task={props.task} />;
}

function TaskDetailInner({
  task,
  staff,
  onClose,
  onChanged,
  onEdit,
}: {
  task: Task;
  staff: Staff[] | null;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  onEdit: (task: Task) => void;
}) {
  const { me, isAdmin, storeName } = useApp();
  const supabase = useMemo(() => createClient(), []);
  const notify = useToast();
  const { setStatus, busyId } = useTaskActions(onChanged);
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const today = todayJST();

  const notes = [...(task.task_notes ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const acting = busyId === task.id || busy;

  async function addMemo() {
    if (!memo.trim()) return;
    setBusy(true);
    const { error } = await supabase
      .from("task_notes")
      .insert({ task_id: task.id, staff_id: me.id, kind: "memo", body: memo.trim() });
    setBusy(false);
    if (error) {
      notify(`メモを追加できませんでした（${error.message}）`, "error");
      return;
    }
    setMemo("");
    notify("メモを追加しました");
    await onChanged();
  }

  async function deleteNote(id: number) {
    if (!window.confirm("このメモを削除しますか？")) return;
    const { error } = await supabase.from("task_notes").delete().eq("id", id);
    if (error) notify(`削除できませんでした（${error.message}）`, "error");
    await onChanged();
  }

  async function deleteTask() {
    if (!window.confirm(`「${task.title}」を削除しますか？（メモ・対応履歴も消えます）`)) return;
    setBusy(true);
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    setBusy(false);
    if (error) {
      notify(`削除できませんでした（${error.message}）`, "error");
      return;
    }
    notify("業務を削除しました");
    onClose();
    await onChanged();
  }

  const actions =
    task.status === "todo" ? (
      <>
        <Button variant="secondary" disabled={acting} onClick={() => setStatus(task, "doing")} className="flex-1">
          対応開始
        </Button>
        <Button disabled={acting} onClick={() => setStatus(task, "done")} className="flex-1">
          完了にする
        </Button>
      </>
    ) : task.status === "doing" ? (
      <>
        <Button variant="ghost" disabled={acting} onClick={() => setStatus(task, "todo")} className="flex-1">
          未着手に戻す
        </Button>
        <Button disabled={acting} onClick={() => setStatus(task, "done")} className="flex-[2]">
          完了にする
        </Button>
      </>
    ) : (
      <Button variant="secondary" disabled={acting} onClick={() => setStatus(task, "doing")} className="flex-1">
        完了を取り消す（対応中に戻す）
      </Button>
    );

  return (
    <Sheet open onClose={onClose} title="業務の詳細" footer={<div className="flex gap-2 pb-3">{actions}</div>}>
      <div className="space-y-4">
        <div>
          <p className="text-xs text-muted">{TASK_LIST_META[task.list].label}</p>
          <p className="text-lg font-semibold text-ink mt-0.5">{task.title}</p>
          <div className="flex items-center gap-1.5 flex-wrap mt-2">
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            {task.store_id !== null && (
              <span className={`${pill} bg-surface text-muted border-hairline`}>{storeName(task.store_id)}</span>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-[5.5rem_1fr] gap-y-1.5 text-sm">
          <dt className="text-muted">期日</dt>
          <dd>
            <DueText task={task} today={today} />
          </dd>
          <dt className="text-muted">担当者</dt>
          <dd className="text-ink">{task.assignee_id ? staffNameOf(staff, task.assignee_id) : "指定なし（誰でも）"}</dd>
          {task.started_at && (
            <>
              <dt className="text-muted">対応開始</dt>
              <dd className="text-ink">
                {staffNameOf(staff, task.started_by)}
                <span className="text-muted tnum ml-2">{monthDayTime(task.started_at)}</span>
              </dd>
            </>
          )}
          {task.completed_at && (
            <>
              <dt className="text-muted">完了</dt>
              <dd className="text-ink">
                {staffNameOf(staff, task.completed_by)}
                <span className="text-muted tnum ml-2">{monthDayTime(task.completed_at)}</span>
              </dd>
            </>
          )}
        </dl>

        {task.description && (
          <p className="text-sm text-ink whitespace-pre-wrap rounded-xl bg-base border border-hairline px-3 py-2.5">
            {task.description}
          </p>
        )}

        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-muted">メモ・対応履歴</h3>
          {notes.length === 0 ? (
            <p className="text-sm text-muted">まだメモはありません</p>
          ) : (
            <ul className="space-y-2">
              {notes.map((n) =>
                n.kind === "status" ? (
                  <li key={n.id} className="text-xs text-muted flex gap-2">
                    <span className="tnum shrink-0">{monthDayTime(n.created_at)}</span>
                    <span>
                      {staffNameOf(staff, n.staff_id)}：{n.body}
                    </span>
                  </li>
                ) : (
                  <li key={n.id} className="rounded-xl border border-hairline bg-surface px-3 py-2">
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <span className="font-semibold text-ink">{staffNameOf(staff, n.staff_id)}</span>
                      <span className="tnum">{monthDayTime(n.created_at)}</span>
                      {(isAdmin || n.staff_id === me.id) && (
                        <button
                          type="button"
                          onClick={() => deleteNote(n.id)}
                          className="ml-auto min-h-8 px-2 rounded-full hover:text-caution hover:bg-caution-soft"
                        >
                          削除
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-ink whitespace-pre-wrap mt-0.5">{n.body}</p>
                  </li>
                )
              )}
            </ul>
          )}
          <TextArea
            label="メモを追加"
            rows={2}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="進み具合・引き継ぎ・気づいたことなど"
          />
          <div className="flex justify-end">
            <Button variant="secondary" disabled={busy || !memo.trim()} onClick={addMemo}>
              メモを追加
            </Button>
          </div>
        </section>

        {isAdmin && (
          <div className="flex gap-2 border-t border-hairline pt-3">
            <Button variant="secondary" onClick={() => onEdit(task)}>
              編集する
            </Button>
            <Button variant="ghost" disabled={busy} onClick={deleteTask} className="hover:!text-caution">
              削除
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
