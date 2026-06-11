"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import {
  Badge,
  Button,
  Card,
  Chip,
  ListSkeleton,
  SectionTitle,
  TextField,
} from "@/components/ui";
import { MonthNav } from "@/components/admin-tabs";
import { addMonths, dateSlash, monthLabelJa, thisMonthJST, todayJST } from "@/lib/format";
import type {
  Menu,
  MenuConsumption,
  Product,
  StockCount,
  StockEntry,
} from "@/lib/types";

type Tab = "status" | "entry" | "count" | "settings";

// 浮動小数点の誤差を丸めて表示（最大2桁）
const fmtQty = (n: number) => String(Number(n.toFixed(2)));

// 施術記録（visit_menus × 標準消費量）から理論消費を計算するための行
interface UsageRow {
  menu_id: number;
  visits: { store_id: number; scheduled_at: string; status: string } | null;
}

export default function InventoryPage() {
  const { isAdmin, storeFilter, storeName } = useApp();
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("status");

  const [products, setProducts] = useState<Product[] | null>(null);
  const [entries, setEntries] = useState<StockEntry[]>([]);
  const [consumptions, setConsumptions] = useState<MenuConsumption[]>([]);
  const [usages, setUsages] = useState<UsageRow[]>([]);
  const [counts, setCounts] = useState<StockCount[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);

  const load = useCallback(async () => {
    setProducts(null);
    const [p, e, c, u, sc, m] = await Promise.all([
      supabase.from("products").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("stock_entries").select("*").order("date", { ascending: false }),
      supabase.from("menu_consumptions").select("*"),
      supabase
        .from("visit_menus")
        .select("menu_id, visits!inner (store_id, scheduled_at, status)")
        .eq("visits.status", "filled"),
      supabase.from("stock_counts").select("*").order("month", { ascending: false }),
      supabase.from("menus").select("*").eq("is_active", true).order("sort_order"),
    ]);
    setProducts((p.data as Product[]) ?? []);
    setEntries((e.data as StockEntry[]) ?? []);
    setConsumptions((c.data as MenuConsumption[]) ?? []);
    setUsages((u.data as unknown as UsageRow[]) ?? []);
    setCounts((sc.data as StockCount[]) ?? []);
    setMenus((m.data as Menu[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  // 理論消費量（商品別）: 記入済みカルテのメニュー回数 × 標準消費量
  const theoreticalUsed = useCallback(
    (productId: number, untilDate?: string) => {
      let total = 0;
      for (const u of usages) {
        if (!u.visits) continue;
        if (storeFilter !== null && u.visits.store_id !== storeFilter) continue;
        if (untilDate && u.visits.scheduled_at >= untilDate) continue;
        const c = consumptions.find(
          (x) => x.menu_id === u.menu_id && x.product_id === productId
        );
        if (c) total += Number(c.amount);
      }
      return total;
    },
    [usages, consumptions, storeFilter]
  );

  const entriesSum = useCallback(
    (productId: number, untilDate?: string) =>
      entries
        .filter(
          (e) =>
            e.product_id === productId &&
            (storeFilter === null || e.store_id === storeFilter) &&
            (!untilDate || e.date < untilDate)
        )
        .reduce((a, e) => a + Number(e.quantity), 0),
    [entries, storeFilter]
  );

  const tabs: { key: Tab; label: string }[] = [
    { key: "status", label: "在庫状況" },
    { key: "entry", label: "入庫登録" },
    { key: "count", label: "月末棚卸" },
    ...(isAdmin ? [{ key: "settings" as Tab, label: "消費量設定" }] : []),
  ];

  return (
    <div className="space-y-5 fade-in">
      <div>
        <h1 className="serif text-3xl text-ink">在庫管理</h1>
        <p className="text-sm text-muted mt-1">{storeName(storeFilter)}</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <Chip key={t.key} label={t.label} selected={tab === t.key} onClick={() => setTab(t.key)} />
        ))}
      </div>

      {products === null ? (
        <ListSkeleton rows={5} />
      ) : (
        <>
          {tab === "status" && (
            <StatusTab
              products={products}
              entriesSum={entriesSum}
              theoreticalUsed={theoreticalUsed}
              counts={counts}
              storeFilter={storeFilter}
            />
          )}
          {tab === "entry" && <EntryTab products={products} entries={entries} onChanged={load} />}
          {tab === "count" && (
            <CountTab
              products={products}
              counts={counts}
              entriesSum={entriesSum}
              theoreticalUsed={theoreticalUsed}
              onChanged={load}
            />
          )}
          {tab === "settings" && isAdmin && (
            <SettingsTab menus={menus} products={products} consumptions={consumptions} onChanged={load} />
          )}
        </>
      )}
    </div>
  );
}

/* ================= 在庫状況 ================= */
function StatusTab({
  products,
  entriesSum,
  theoreticalUsed,
  counts,
  storeFilter,
}: {
  products: Product[];
  entriesSum: (productId: number) => number;
  theoreticalUsed: (productId: number) => number;
  counts: StockCount[];
  storeFilter: number | null;
}) {
  return (
    <Card className="p-4 space-y-3">
      <SectionTitle>理論在庫（入庫累計 − 施術記録からの理論消費）</SectionTitle>
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-xs text-muted border-b border-hairline">
              <th className="text-left py-2 font-semibold">商品・備品</th>
              <th className="text-right font-semibold">入庫累計</th>
              <th className="text-right font-semibold">理論消費</th>
              <th className="text-right font-semibold">理論在庫</th>
              <th className="text-left pl-4 font-semibold">直近の棚卸</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {products.map((p) => {
              const stock = entriesSum(p.id) - theoreticalUsed(p.id);
              const lastCount = counts.find(
                (c) =>
                  c.product_id === p.id &&
                  (storeFilter === null || c.store_id === storeFilter)
              );
              return (
                <tr key={p.id}>
                  <td className="py-2 text-ink">
                    {p.name}
                    <span className="ml-1 text-[11px] text-muted">（{p.category}）</span>
                  </td>
                  <td className="text-right tnum">{fmtQty(entriesSum(p.id))} {p.unit}</td>
                  <td className="text-right tnum text-muted">
                    {theoreticalUsed(p.id) > 0 ? `${fmtQty(theoreticalUsed(p.id))} ${p.unit}` : "—"}
                  </td>
                  <td className={`text-right tnum font-semibold ${stock < 0 ? "text-caution" : "text-ink"}`}>
                    {fmtQty(stock)} {p.unit}
                  </td>
                  <td className="pl-4 text-xs text-muted">
                    {lastCount
                      ? `${monthLabelJa(lastCount.month)}: ${lastCount.counted_qty} ${p.unit}${lastCount.diff_reason ? `（${lastCount.diff_reason}）` : ""}`
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted">
        理論消費＝記入済みカルテのメニュー回数 × 標準消費量。全店舗表示では合算されます
      </p>
    </Card>
  );
}

/* ================= 入庫登録 ================= */
function EntryTab({
  products,
  entries,
  onChanged,
}: {
  products: Product[];
  entries: StockEntry[];
  onChanged: () => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { stores, storeFilter } = useApp();
  const [productId, setProductId] = useState<number | null>(null);
  const [storeId, setStoreId] = useState<number>(storeFilter ?? stores[0]?.id);
  const [date, setDate] = useState(todayJST());
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [invoice, setInvoice] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!productId || !Number(qty)) {
      setError("商品と数量を入力してください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let invoicePath: string | null = null;
      if (invoice) {
        invoicePath = `${storeId}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("inventory-docs")
          .upload(invoicePath, invoice);
        if (upErr) throw upErr;
      }
      const { error: insErr } = await supabase.from("stock_entries").insert({
        product_id: productId,
        store_id: storeId,
        date,
        quantity: Number(qty),
        note: note.trim() || null,
        invoice_path: invoicePath,
      });
      if (insErr) throw insErr;
      setQty("");
      setNote("");
      setInvoice(null);
      await onChanged();
    } catch (e) {
      console.error(e);
      setError("登録に失敗しました");
    }
    setBusy(false);
  }

  async function openInvoice(path: string) {
    const { data } = await supabase.storage.from("inventory-docs").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <SectionTitle>入庫を登録</SectionTitle>
        <div className="flex gap-2 flex-wrap">
          {products.map((p) => (
            <Chip
              key={p.id}
              label={p.name}
              selected={productId === p.id}
              onClick={() => setProductId(p.id)}
            />
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          {stores.map((s) => (
            <Chip
              key={s.id}
              label={s.name}
              selected={storeId === s.id}
              onClick={() => setStoreId(s.id)}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <label className="block">
            <span className="block text-xs font-semibold text-muted mb-1">日付</span>
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="w-full min-h-11 rounded-lg border border-hairline bg-surface px-2 text-sm outline-none focus:border-gold"
            />
          </label>
          <TextField
            label={`数量${productId ? `（${products.find((p) => p.id === productId)?.unit}）` : ""}`}
            type="number"
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
          <TextField label="メモ（任意）" value={note} onChange={(e) => setNote(e.target.value)} />
          <label className="inline-flex items-center justify-center min-h-11 rounded-full border border-dashed border-gold/60 text-sm text-gold-dk cursor-pointer hover:bg-gold-soft transition-colors px-3">
            {invoice ? `📷 ${invoice.name.slice(0, 14)}…` : "📷 納品書を撮影/添付"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => setInvoice(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        {error && (
          <p className="text-sm text-caution bg-caution-soft rounded-lg px-3 py-2">{error}</p>
        )}
        <Button disabled={busy} onClick={save}>
          {busy ? "登録中…" : "入庫を登録する"}
        </Button>
      </Card>

      <Card className="p-4 space-y-2">
        <SectionTitle>最近の入庫</SectionTitle>
        {entries.length === 0 ? (
          <p className="text-sm text-muted">入庫記録はまだありません</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {entries.slice(0, 15).map((e) => {
              const p = products.find((x) => x.id === e.product_id);
              return (
                <li key={e.id} className="py-2 flex items-center gap-2 text-sm flex-wrap">
                  <span className="text-muted tnum w-24">{dateSlash(e.date)}</span>
                  <span className="text-ink">{p?.name}</span>
                  <span className="tnum">
                    +{e.quantity} {p?.unit}
                  </span>
                  <span className="text-xs text-muted">
                    {stores.find((s) => s.id === e.store_id)?.name}
                    {e.note && ` ・ ${e.note}`}
                  </span>
                  <span className="flex-1" />
                  {e.invoice_path && (
                    <Button variant="ghost" onClick={() => openInvoice(e.invoice_path!)}>
                      納品書
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ================= 月末棚卸 ================= */
function CountTab({
  products,
  counts,
  entriesSum,
  theoreticalUsed,
  onChanged,
}: {
  products: Product[];
  counts: StockCount[];
  entriesSum: (productId: number, untilDate?: string) => number;
  theoreticalUsed: (productId: number, untilDate?: string) => number;
  onChanged: () => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { stores, storeFilter } = useApp();
  const [month, setMonth] = useState(thisMonthJST());
  const [storeId, setStoreId] = useState<number>(storeFilter ?? stores[0]?.id);
  const [form, setForm] = useState<Record<number, { qty: string; reason: string }>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const monthEnd = addMonths(month, 1);

  useEffect(() => {
    const init: Record<number, { qty: string; reason: string }> = {};
    for (const p of products) {
      const existing = counts.find(
        (c) => c.product_id === p.id && c.store_id === storeId && c.month === month
      );
      init[p.id] = {
        qty: existing ? String(existing.counted_qty) : "",
        reason: existing?.diff_reason ?? "",
      };
    }
    setForm(init);
  }, [products, counts, storeId, month]);

  async function save() {
    setBusy(true);
    setMessage(null);
    const payload = Object.entries(form)
      .filter(([, v]) => v.qty !== "")
      .map(([pid, v]) => ({
        product_id: Number(pid),
        store_id: storeId,
        month,
        counted_qty: Number(v.qty),
        diff_reason: v.reason.trim() || null,
      }));
    const { error } = await supabase
      .from("stock_counts")
      .upsert(payload, { onConflict: "product_id,store_id,month" });
    setMessage(error ? "保存に失敗しました" : "保存しました");
    if (!error) await onChanged();
    setBusy(false);
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <SectionTitle className="flex-1">月末棚卸（{monthLabelJa(month)}）</SectionTitle>
        <MonthNav month={month} onChange={setMonth} />
      </div>
      <div className="flex gap-2 flex-wrap">
        {stores.map((s) => (
          <Chip key={s.id} label={s.name} selected={storeId === s.id} onClick={() => setStoreId(s.id)} />
        ))}
      </div>

      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-xs text-muted border-b border-hairline">
              <th className="text-left py-2 font-semibold">商品・備品</th>
              <th className="text-right font-semibold">理論在庫（月末時点）</th>
              <th className="text-right font-semibold">実在庫</th>
              <th className="text-right font-semibold">差分</th>
              <th className="text-left pl-4 font-semibold">差分理由</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {products.map((p) => {
              // この店舗・月末時点の理論在庫
              const theoEntries = entriesSum(p.id, monthEnd);
              const theoUsed = theoreticalUsed(p.id, `${monthEnd}T00:00:00+09:00`);
              const theoretical = theoEntries - theoUsed;
              const v = form[p.id] ?? { qty: "", reason: "" };
              const diff = v.qty === "" ? null : Number(v.qty) - theoretical;
              return (
                <tr key={p.id}>
                  <td className="py-1.5 text-ink">{p.name}</td>
                  <td className="text-right tnum text-muted">
                    {fmtQty(theoretical)} {p.unit}
                  </td>
                  <td className="text-right">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={v.qty}
                      placeholder="—"
                      onChange={(e) =>
                        setForm({ ...form, [p.id]: { ...v, qty: e.target.value } })
                      }
                      className="w-24 min-h-10 rounded-lg border border-hairline bg-surface px-2 text-right text-sm outline-none focus:border-gold tnum"
                    />
                  </td>
                  <td className="text-right">
                    {diff === null ? (
                      <span className="text-muted">—</span>
                    ) : diff === 0 ? (
                      <Badge color="ok">一致</Badge>
                    ) : (
                      <Badge color={Math.abs(diff) > 5 ? "caution" : "warn"}>
                        {diff > 0 ? "+" : ""}
                        {fmtQty(diff)} {p.unit}
                      </Badge>
                    )}
                  </td>
                  <td className="pl-4">
                    <input
                      type="text"
                      value={v.reason}
                      placeholder={diff !== null && diff !== 0 ? "差分理由を入力" : ""}
                      onChange={(e) =>
                        setForm({ ...form, [p.id]: { ...v, reason: e.target.value } })
                      }
                      className="w-full min-h-10 rounded-lg border border-hairline bg-surface px-2 text-sm outline-none focus:border-gold"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <Button disabled={busy} onClick={save}>
          {busy ? "保存中…" : "棚卸を保存する"}
        </Button>
        {message && (
          <span className={`text-sm ${message.includes("失敗") ? "text-caution" : "text-ok"}`}>
            {message}
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted">
        理論在庫＝月末までの入庫累計 − 記入済みカルテからの理論消費（店舗別）
      </p>
    </Card>
  );
}

/* ================= 消費量設定（管理者） ================= */
function SettingsTab({
  menus,
  products,
  consumptions,
  onChanged,
}: {
  menus: Menu[];
  products: Product[];
  consumptions: MenuConsumption[];
  onChanged: () => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [form, setForm] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const c of consumptions) init[`${c.menu_id}:${c.product_id}`] = String(c.amount);
    return init;
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    const upserts: MenuConsumption[] = [];
    const deletes: { menu_id: number; product_id: number }[] = [];
    for (const m of menus) {
      for (const p of products) {
        const key = `${m.id}:${p.id}`;
        const raw = form[key];
        const existing = consumptions.find((c) => c.menu_id === m.id && c.product_id === p.id);
        const val = raw === undefined || raw === "" ? 0 : Number(raw);
        if (val > 0) {
          upserts.push({ menu_id: m.id, product_id: p.id, amount: val });
        } else if (existing) {
          deletes.push({ menu_id: m.id, product_id: p.id });
        }
      }
    }
    let failed = false;
    if (upserts.length > 0) {
      const { error } = await supabase
        .from("menu_consumptions")
        .upsert(upserts, { onConflict: "menu_id,product_id" });
      if (error) failed = true;
    }
    for (const d of deletes) {
      const { error } = await supabase
        .from("menu_consumptions")
        .delete()
        .eq("menu_id", d.menu_id)
        .eq("product_id", d.product_id);
      if (error) failed = true;
    }
    setMessage(failed ? "保存に失敗しました" : "保存しました");
    if (!failed) await onChanged();
    setBusy(false);
  }

  return (
    <Card className="p-4 space-y-3">
      <SectionTitle>メニューごとの標準消費量（施術1回あたり）</SectionTitle>
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-xs text-muted border-b border-hairline">
              <th className="text-left py-2 font-semibold">メニュー ＼ 商品</th>
              {products.map((p) => (
                <th key={p.id} className="text-right font-semibold px-1">
                  {p.name}
                  <span className="block font-normal">（{p.unit}）</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {menus.map((m) => (
              <tr key={m.id}>
                <td className="py-1.5 text-ink whitespace-nowrap pr-2">{m.name}</td>
                {products.map((p) => {
                  const key = `${m.id}:${p.id}`;
                  return (
                    <td key={p.id} className="text-right px-1">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        min={0}
                        value={form[key] ?? ""}
                        placeholder="—"
                        onChange={(e) => {
                          setForm({ ...form, [key]: e.target.value });
                          setMessage(null);
                        }}
                        className="w-18 min-h-10 rounded-lg border border-hairline bg-surface px-1.5 text-right text-sm outline-none focus:border-gold tnum"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <Button disabled={busy} onClick={save}>
          {busy ? "保存中…" : "消費量を保存する"}
        </Button>
        {message && (
          <span className={`text-sm ${message.includes("失敗") ? "text-caution" : "text-ok"}`}>
            {message}
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted">
        空欄＝消費なし。カルテが「記入済み」になると、選択されたメニューに応じて理論在庫が自動で減ります
      </p>
    </Card>
  );
}
