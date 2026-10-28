"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AdminTabs, MonthNav } from "@/components/admin-tabs";
import { Badge, Button, Card, Chip, EmptyState, ListSkeleton, SectionTitle, StickyActions, TextField } from "@/components/ui";
import { useToast } from "@/components/toast";
import {
  addMonths,
  dateSlash,
  fileSize,
  monthLabelJa,
  staffLabel,
  thisMonthJST,
} from "@/lib/format";
import {
  MONTHLY_CATEGORIES,
  STAFF_DOC_ACCEPT,
  STAFF_DOC_MAX_BYTES,
  STAFF_DOCS_BUCKET,
  matchStaffByFileName,
  uploadStaffDocument,
} from "@/lib/staff-docs";
import { STAFF_DOCUMENT_CATEGORIES } from "@/lib/types";
import type { Staff, StaffDocument, StaffDocumentCategory } from "@/lib/types";

interface Pending {
  key: string;
  file: File;
  staffId: number | null;
  title: string;
  titleEdited: boolean;
}

const defaultTitle = (category: StaffDocumentCategory, month: string, file: File) =>
  MONTHLY_CATEGORIES.includes(category)
    ? `${monthLabelJa(month)} ${category}`
    : file.name.replace(/\.[^.]+$/, "");

// スタッフ書類（管理者）: 給与明細・源泉徴収票などをスタッフごとに配布
export default function StaffDocsAdminPage() {
  return (
    <Suspense>
      <StaffDocsAdmin />
    </Suspense>
  );
}

function StaffDocsAdmin() {
  const params = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const notify = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [staff, setStaff] = useState<Staff[]>([]);
  const [docs, setDocs] = useState<StaffDocument[] | null>(null);
  const [filterStaff, setFilterStaff] = useState<number | null>(null);
  const [category, setCategory] = useState<StaffDocumentCategory>(
    (STAFF_DOCUMENT_CATEGORIES as readonly string[]).includes(params.get("category") ?? "")
      ? (params.get("category") as StaffDocumentCategory)
      : "給与明細"
  );
  const [month, setMonth] = useState(params.get("month") ?? addMonths(thisMonthJST(), -1));
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [st, dc] = await Promise.all([
      supabase.from("staff").select("*").eq("is_active", true).order("id"),
      supabase.from("staff_documents").select("*").order("created_at", { ascending: false }).limit(300),
    ]);
    const staffRows = (st.data as Staff[]) ?? [];
    setStaff(staffRows);
    // スタッフ一覧の読み込みより先にファイルを選んだ場合も、配布先を自動で選び直す
    setPending((list) =>
      list.map((p) => (p.staffId === null ? { ...p, staffId: matchStaffByFileName(p.file.name, staffRows) } : p))
    );
    if (dc.error) {
      setError("書類を読み込めませんでした（028_staff_documents.sql が未実行の可能性があります）");
      setDocs([]);
      return;
    }
    setDocs((dc.data as StaffDocument[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  // 種類・対象月を変えたら、手で直していないタイトルを付け直す
  function retitle(nextCategory: StaffDocumentCategory, nextMonth: string) {
    setPending((list) =>
      list.map((p) => (p.titleEdited ? p : { ...p, title: defaultTitle(nextCategory, nextMonth, p.file) }))
    );
  }
  function changeCategory(c: StaffDocumentCategory) {
    setCategory(c);
    retitle(c, month);
  }
  function changeMonth(m: string) {
    setMonth(m);
    retitle(category, m);
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    setError(null);
    const added: Pending[] = [];
    for (const file of Array.from(files)) {
      if (file.size > STAFF_DOC_MAX_BYTES) {
        setError(`「${file.name}」は20MBを超えているため追加できません`);
        continue;
      }
      added.push({
        key: `${file.name}-${file.size}-${Math.random()}`,
        file,
        staffId: matchStaffByFileName(file.name, staff),
        title: defaultTitle(category, month, file),
        titleEdited: false,
      });
    }
    setPending((list) => [...list, ...added]);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function uploadAll() {
    if (pending.some((p) => p.staffId === null)) {
      setError("配布先のスタッフが決まっていないファイルがあります");
      return;
    }
    setError(null);
    let done = 0;
    const failed: Pending[] = [];
    for (const p of pending) {
      setBusy(`アップロード中… ${done + 1}/${pending.length}`);
      const res = await uploadStaffDocument({
        staffId: p.staffId!,
        file: p.file,
        category,
        month: MONTHLY_CATEGORIES.includes(category) ? month : null,
        title: p.title,
      });
      if (res.ok) done++;
      else {
        failed.push(p);
        setError(res.message);
      }
    }
    setBusy(null);
    setPending(failed);
    if (done > 0) notify(`${done}件の書類を配布しました`);
    await load();
  }

  async function openDoc(d: StaffDocument) {
    // ポップアップブロックを避けるため、先に空のタブを開いてから URL を入れる
    const win = window.open("", "_blank");
    const { data } = await supabase.storage.from(STAFF_DOCS_BUCKET).createSignedUrl(d.storage_path, 60);
    if (data?.signedUrl && win) win.location.href = data.signedUrl;
    else {
      win?.close();
      notify("ファイルを開けませんでした", "error");
    }
  }

  async function removeDoc(d: StaffDocument) {
    const who = staff.find((s) => s.id === d.staff_id)?.name ?? "";
    if (!window.confirm(`${who}さんの「${d.title}」を削除しますか？\n（スタッフの画面からも消えます）`)) return;
    const { error: err } = await supabase.from("staff_documents").delete().eq("id", d.id);
    if (err) {
      notify("削除できませんでした", "error");
      return;
    }
    await supabase.storage.from(STAFF_DOCS_BUCKET).remove([d.storage_path]);
    notify("削除しました");
    await load();
  }

  const staffName = (id: number) => staffLabel(staff.find((s) => s.id === id));
  const shown = (docs ?? []).filter((d) => filterStaff === null || d.staff_id === filterStaff);
  const unread = (docs ?? []).filter((d) => !d.viewed_at).length;

  return (
    <div className="space-y-5 fade-in">
      <AdminTabs />
      <div>
        <h1 className="serif text-3xl text-ink">スタッフ書類</h1>
        <p className="text-sm text-muted mt-1">
          給与明細・源泉徴収票など、税理士から届いた書類をスタッフごとに配布します。
          届いた書類は本人の「メニュー ＞ マイ書類」に表示され、本人と管理者だけが閲覧できます
        </p>
      </div>

      {/* 配布 */}
      <Card className="p-4 space-y-4">
        <SectionTitle>書類を配布する</SectionTitle>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted">書類の種類</p>
          <div className="flex gap-2 flex-wrap">
            {STAFF_DOCUMENT_CATEGORIES.map((c) => (
              <Chip key={c} label={c} selected={category === c} onClick={() => changeCategory(c)} />
            ))}
          </div>
        </div>
        {MONTHLY_CATEGORIES.includes(category) && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted">対象月</p>
            <MonthNav month={month} onChange={changeMonth} />
          </div>
        )}

        <div className="space-y-2">
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={STAFF_DOC_ACCEPT}
            onChange={(e) => addFiles(e.target.files)}
            className="sr-only"
            id="staff-doc-files"
          />
          <label
            htmlFor="staff-doc-files"
            className="flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-gold/50 bg-gold-soft/30 px-4 py-6 text-center cursor-pointer hover:bg-gold-soft/60 transition-colors"
          >
            <span className="text-sm font-semibold text-gold-dk">＋ ファイルを選ぶ（複数可）</span>
            <span className="text-xs text-muted">
              PDF・画像・Excel・CSV（1ファイル20MBまで）。ファイル名にスタッフの名前があれば、配布先を自動で選びます
            </span>
          </label>
        </div>

        {pending.length > 0 && (
          <ul className="space-y-3">
            {pending.map((p) => (
              <li key={p.key} className="rounded-xl border border-hairline bg-base p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-ink break-all">
                    📄 {p.file.name}
                    <span className="ml-1 text-xs text-muted">{fileSize(p.file.size)}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setPending((l) => l.filter((x) => x.key !== p.key))}
                    className="shrink-0 min-h-9 px-3 text-xs text-muted hover:text-caution"
                  >
                    外す
                  </button>
                </div>
                <div className="flex gap-1.5 flex-wrap" role="radiogroup" aria-label="配布先">
                  {staff.map((s) => (
                    <Chip
                      key={s.id}
                      label={staffLabel(s)}
                      selected={p.staffId === s.id}
                      onClick={() =>
                        setPending((l) => l.map((x) => (x.key === p.key ? { ...x, staffId: s.id } : x)))
                      }
                    />
                  ))}
                </div>
                {p.staffId === null && <p className="text-xs text-warn">配布先のスタッフを選んでください</p>}
                <TextField
                  label="タイトル（スタッフの画面に表示）"
                  value={p.title}
                  onChange={(e) =>
                    setPending((l) =>
                      l.map((x) => (x.key === p.key ? { ...x, title: e.target.value, titleEdited: true } : x))
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-sm text-caution bg-caution-soft rounded-lg px-3 py-2">{error}</p>}

        {pending.length > 0 && (
          <StickyActions>
            <Button className="w-full" disabled={busy !== null} onClick={uploadAll}>
              {busy ?? `${pending.length}件を配布する`}
            </Button>
          </StickyActions>
        )}
      </Card>

      {/* 配布済み */}
      <Card className="p-4 space-y-3">
        <SectionTitle>配布済みの書類</SectionTitle>
        <p className="text-xs text-muted">
          「未読」は本人がまだ開いていない書類です（{unread}件）
        </p>
        <div className="-mx-4 px-4 overflow-x-auto no-scrollbar">
          <div className="flex gap-1.5 min-w-max">
            <Chip label="全員" selected={filterStaff === null} onClick={() => setFilterStaff(null)} />
            {staff.map((s) => (
              <Chip key={s.id} label={staffLabel(s)} selected={filterStaff === s.id} onClick={() => setFilterStaff(s.id)} />
            ))}
          </div>
        </div>
        {docs === null ? (
          <ListSkeleton rows={3} />
        ) : shown.length === 0 ? (
          <EmptyState message="まだ配布した書類はありません" />
        ) : (
          <ul className="divide-y divide-hairline">
            {shown.map((d) => (
              <li key={d.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink break-words">{d.title}</p>
                  <p className="text-xs text-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{staffName(d.staff_id)}</span>
                    <span>{d.category}</span>
                    <span className="tnum">{dateSlash(d.created_at)} 配布</span>
                    {d.size_bytes ? <span>{fileSize(d.size_bytes)}</span> : null}
                    {d.viewed_at ? (
                      <Badge color="ok">既読 {dateSlash(d.viewed_at).slice(5)}</Badge>
                    ) : (
                      <Badge color="warn">未読</Badge>
                    )}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0 -ml-3 sm:ml-0">
                  <Button variant="ghost" onClick={() => openDoc(d)}>
                    開く
                  </Button>
                  <Button variant="ghost" onClick={() => removeDoc(d)}>
                    削除
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
