"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { Badge, Button, Card, Chip, ListSkeleton, TextField } from "@/components/ui";
import type { FlagColorKey } from "@/lib/types";

/* ============================================================
   マスタ管理（管理者専用）
   テーブルごとのフィールド定義でフォームを生成する汎用CRUD
   ============================================================ */

type FieldType = "text" | "number" | "stores" | "color_key" | "role";

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  hint?: string;
}

interface TabDef {
  key: string;
  table: string;
  label: string;
  fields: FieldDef[];
  orderBy: string;
  note?: string;
}

const TABS: TabDef[] = [
  {
    key: "menus",
    table: "menus",
    label: "メニュー",
    orderBy: "sort_order",
    fields: [
      { key: "name", label: "メニュー名", type: "text", required: true },
      { key: "price", label: "価格（円）", type: "number" },
      { key: "store_ids", label: "対応店舗（未選択=全店舗）", type: "stores" },
      { key: "sort_order", label: "表示順", type: "number" },
    ],
  },
  {
    key: "body_parts",
    table: "body_parts",
    label: "施術部位",
    orderBy: "sort_order",
    fields: [
      { key: "name", label: "部位名", type: "text", required: true },
      { key: "sort_order", label: "表示順", type: "number" },
    ],
  },
  {
    key: "flag_types",
    table: "flag_types",
    label: "顧客フラグ",
    orderBy: "sort_order",
    fields: [
      { key: "name", label: "フラグ名", type: "text", required: true },
      { key: "color_key", label: "色", type: "color_key" },
      { key: "sort_order", label: "表示順", type: "number" },
    ],
  },
  {
    key: "ticket_products",
    table: "ticket_products",
    label: "回数券商品",
    orderBy: "sort_order",
    note: "販売済みの回数券（お客様の保有分）には影響しません。",
    fields: [
      { key: "name", label: "商品名", type: "text", required: true },
      { key: "total_count", label: "総回数", type: "number", required: true },
      { key: "price", label: "販売価格（円）", type: "number", required: true },
      { key: "valid_days", label: "有効期間（日数）", type: "number", required: true },
      { key: "sort_order", label: "表示順", type: "number" },
    ],
  },
  {
    key: "staff",
    table: "staff",
    label: "スタッフ",
    orderBy: "id",
    note: "ログインアカウントの発行は Supabase の管理画面（または scripts/create-users.mjs）で行い、ここのメールアドレスと一致させてください。",
    fields: [
      { key: "name", label: "名前", type: "text", required: true },
      { key: "kana", label: "カナ", type: "text" },
      { key: "email", label: "メールアドレス", type: "text", required: true },
      { key: "role", label: "ロール", type: "role" },
      { key: "icon_emoji", label: "絵文字アイコン", type: "text", hint: "🐨 🐱 🦄 など" },
      { key: "theme_color", label: "テーマカラー", type: "text", hint: "#B89B5E 形式" },
    ],
  },
];

const COLOR_KEYS: { key: FlagColorKey; label: string }[] = [
  { key: "caution", label: "深紅（要注意）" },
  { key: "warn", label: "アンバー" },
  { key: "ok", label: "グリーン" },
  { key: "rose", label: "ローズ" },
  { key: "gold", label: "ゴールド" },
];

type Row = Record<string, unknown> & { id: number; is_active: boolean };

export default function MastersPage() {
  const [tabKey, setTabKey] = useState(TABS[0].key);
  const tab = TABS.find((t) => t.key === tabKey)!;

  return (
    <div className="space-y-5 fade-in">
      <div>
        <h1 className="serif text-3xl text-ink">マスタ管理</h1>
        <p className="text-sm text-muted mt-1">管理者専用</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <Chip
            key={t.key}
            label={t.label}
            selected={tabKey === t.key}
            onClick={() => setTabKey(t.key)}
          />
        ))}
      </div>

      <MasterTable key={tab.key} tab={tab} />
    </div>
  );
}

function MasterTable({ tab }: { tab: TabDef }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from(tab.table).select("*").order(tab.orderBy);
    setRows((data as Row[]) ?? []);
  }, [supabase, tab]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(row: Row) {
    setError(null);
    const { error: err } = await supabase
      .from(tab.table)
      .update({ is_active: !row.is_active })
      .eq("id", row.id);
    if (err) setError("更新に失敗しました（管理者権限が必要です）");
    await load();
  }

  return (
    <Card className="p-4 space-y-3">
      {tab.note && <p className="text-xs text-muted">{tab.note}</p>}

      {rows === null ? (
        <ListSkeleton rows={3} />
      ) : (
        <ul className="divide-y divide-hairline">
          {rows.map((row) => (
            <li key={row.id} className="py-3">
              {editing !== "new" && editing?.id === row.id ? (
                <MasterForm
                  tab={tab}
                  initial={row}
                  onCancel={() => setEditing(null)}
                  onSaved={async () => {
                    setEditing(null);
                    await load();
                  }}
                />
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className={`min-w-0 ${row.is_active ? "" : "opacity-50"}`}>
                    <p className="font-medium text-ink">
                      {tab.table === "staff" && `${row.icon_emoji ?? ""} `}
                      {String(row.name ?? "")}
                      {!row.is_active && (
                        <span className="ml-2 align-middle">
                          <Badge color="caution">無効</Badge>
                        </span>
                      )}
                      {tab.table === "staff" && row.role === "admin" && (
                        <span className="ml-2 align-middle">
                          <Badge color="gold">管理者</Badge>
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted mt-0.5 truncate tnum">
                      {summaryLine(tab, row)}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" onClick={() => setEditing(row)}>
                      編集
                    </Button>
                    <Button variant="ghost" onClick={() => toggleActive(row)}>
                      {row.is_active ? "無効化" : "有効化"}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing === "new" ? (
        <MasterForm
          tab={tab}
          initial={null}
          onCancel={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      ) : (
        <Button variant="secondary" onClick={() => setEditing("new")}>
          ＋ 新規追加
        </Button>
      )}

      {error && (
        <p className="text-sm text-caution bg-caution-soft rounded-lg px-3 py-2">{error}</p>
      )}
    </Card>
  );
}

function summaryLine(tab: TabDef, row: Row): string {
  switch (tab.table) {
    case "menus": {
      const ids = (row.store_ids as number[]) ?? [];
      return `¥${Number(row.price ?? 0).toLocaleString()} ・ ${ids.length === 0 ? "全店舗" : `店舗ID: ${ids.join(",")}`}`;
    }
    case "ticket_products":
      return `${row.total_count}回 ・ ¥${Number(row.price ?? 0).toLocaleString()} ・ 有効${row.valid_days}日`;
    case "flag_types":
      return `色: ${COLOR_KEYS.find((c) => c.key === row.color_key)?.label ?? row.color_key}`;
    case "staff":
      return `${row.email ?? ""}`;
    default:
      return `表示順: ${row.sort_order ?? 0}`;
  }
}

function MasterForm({
  tab,
  initial,
  onCancel,
  onSaved,
}: {
  tab: TabDef;
  initial: Row | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { stores } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const f of tab.fields) {
      init[f.key] =
        initial?.[f.key] ??
        (f.type === "number" ? 0 : f.type === "stores" ? [] : f.type === "color_key" ? "warn" : f.type === "role" ? "staff" : "");
    }
    return init;
  });

  async function save() {
    setError(null);
    for (const f of tab.fields) {
      if (f.required && !String(form[f.key] ?? "").trim()) {
        setError(`「${f.label}」を入力してください`);
        return;
      }
    }
    setBusy(true);
    const payload = { ...form };
    const { error: err } = initial
      ? await supabase.from(tab.table).update(payload).eq("id", initial.id)
      : await supabase.from(tab.table).insert(payload);
    if (err) {
      console.error(err);
      setError("保存に失敗しました");
      setBusy(false);
      return;
    }
    await onSaved();
  }

  return (
    <div className="rounded-xl border border-gold/40 bg-gold-soft/30 p-3 space-y-3 fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {tab.fields.map((f) => {
          if (f.type === "stores") {
            const selected = (form[f.key] as number[]) ?? [];
            return (
              <div key={f.key} className="sm:col-span-2">
                <p className="text-xs font-semibold text-muted mb-1">{f.label}</p>
                <div className="flex gap-2 flex-wrap">
                  {stores.map((s) => (
                    <Chip
                      key={s.id}
                      label={s.name}
                      selected={selected.includes(s.id)}
                      onClick={() =>
                        setForm({
                          ...form,
                          [f.key]: selected.includes(s.id)
                            ? selected.filter((x) => x !== s.id)
                            : [...selected, s.id],
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            );
          }
          if (f.type === "color_key") {
            return (
              <div key={f.key} className="sm:col-span-2">
                <p className="text-xs font-semibold text-muted mb-1">{f.label}</p>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_KEYS.map((c) => (
                    <Chip
                      key={c.key}
                      label={c.label}
                      selected={form[f.key] === c.key}
                      onClick={() => setForm({ ...form, [f.key]: c.key })}
                    />
                  ))}
                </div>
              </div>
            );
          }
          if (f.type === "role") {
            return (
              <div key={f.key}>
                <p className="text-xs font-semibold text-muted mb-1">{f.label}</p>
                <div className="flex gap-2">
                  <Chip
                    label="スタッフ"
                    selected={form[f.key] === "staff"}
                    onClick={() => setForm({ ...form, [f.key]: "staff" })}
                  />
                  <Chip
                    label="管理者"
                    selected={form[f.key] === "admin"}
                    onClick={() => setForm({ ...form, [f.key]: "admin" })}
                  />
                </div>
              </div>
            );
          }
          return (
            <TextField
              key={f.key}
              label={f.hint ? `${f.label}（${f.hint}）` : f.label}
              type={f.type === "number" ? "number" : "text"}
              inputMode={f.type === "number" ? "numeric" : undefined}
              value={String(form[f.key] ?? "")}
              onChange={(e) =>
                setForm({
                  ...form,
                  [f.key]: f.type === "number" ? Number(e.target.value || 0) : e.target.value,
                })
              }
            />
          );
        })}
      </div>
      {error && (
        <p className="text-sm text-caution bg-caution-soft rounded-lg px-3 py-2">{error}</p>
      )}
      <div className="flex gap-2">
        <Button disabled={busy} onClick={save}>
          {initial ? "更新する" : "追加する"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          キャンセル
        </Button>
      </div>
    </div>
  );
}
