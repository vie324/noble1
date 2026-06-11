"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { Button, Card, Chip, ListSkeleton, SectionTitle } from "@/components/ui";
import { AdminTabs, MonthNav } from "@/components/admin-tabs";
import { addMonths, monthLabelJa, thisMonthJST, yen } from "@/lib/format";

interface DayRow {
  date: string;
  spot_sales: number;
  ticket_sales: number;
  ticket_usage: number;
  product_sales: number;
}

// カルテ連動の参考値（その日の回数券販売額・消化額）
interface LinkedHint {
  sold: number;
  used: number;
}

export default function SalesInputPage() {
  const { stores, storeFilter } = useApp();
  const supabase = useMemo(() => createClient(), []);
  const [month, setMonth] = useState(thisMonthJST());
  const [storeId, setStoreId] = useState<number>(storeFilter ?? stores[0]?.id);
  const [rows, setRows] = useState<DayRow[] | null>(null);
  const [hints, setHints] = useState<Record<string, LinkedHint>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    setDirty(false);
    const monthEnd = addMonths(month, 1);

    const [{ data: sales }, { data: sold }, { data: usages }] = await Promise.all([
      supabase
        .from("daily_sales")
        .select("*")
        .eq("store_id", storeId)
        .gte("date", month)
        .lt("date", monthEnd),
      // カルテ連動: 当月にこの店舗で販売された回数券
      supabase
        .from("customer_tickets")
        .select("purchased_at, price")
        .eq("store_id", storeId)
        .gte("purchased_at", month)
        .lt("purchased_at", monthEnd),
      // カルテ連動: 当月の消化（取消除く）。金額は 1回分単価
      supabase
        .from("ticket_usages")
        .select("used_at, canceled_at, customer_tickets!inner (price, total_count, store_id)")
        .gte("used_at", `${month}T00:00:00+09:00`)
        .lt("used_at", `${monthEnd}T00:00:00+09:00`)
        .eq("customer_tickets.store_id", storeId),
    ]);

    // 月の全日分の行を用意（既存データをマージ）
    const byDate = new Map((sales ?? []).map((r) => [r.date, r]));
    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const list: DayRow[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${month.slice(0, 7)}-${String(d).padStart(2, "0")}`;
      const existing = byDate.get(date);
      list.push({
        date,
        spot_sales: existing?.spot_sales ?? 0,
        ticket_sales: existing?.ticket_sales ?? 0,
        ticket_usage: existing?.ticket_usage ?? 0,
        product_sales: existing?.product_sales ?? 0,
      });
    }
    setRows(list);

    // 参考値の集計
    const h: Record<string, LinkedHint> = {};
    for (const s of sold ?? []) {
      const key = s.purchased_at as string;
      (h[key] ??= { sold: 0, used: 0 }).sold += s.price as number;
    }
    for (const u of (usages ?? []) as unknown as {
      used_at: string;
      canceled_at: string | null;
      customer_tickets: { price: number; total_count: number };
    }[]) {
      if (u.canceled_at) continue;
      const key = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
        new Date(u.used_at)
      );
      (h[key] ??= { sold: 0, used: 0 }).used += Math.round(
        u.customer_tickets.price / u.customer_tickets.total_count
      );
    }
    setHints(h);
  }, [supabase, month, storeId]);

  useEffect(() => {
    load();
  }, [load]);

  function update(date: string, key: keyof Omit<DayRow, "date">, value: number) {
    setRows((prev) =>
      prev ? prev.map((r) => (r.date === date ? { ...r, [key]: value } : r)) : prev
    );
    setDirty(true);
    setMessage(null);
  }

  function applyLinked(date: string) {
    const h = hints[date];
    if (!h) return;
    setRows((prev) =>
      prev
        ? prev.map((r) =>
            r.date === date ? { ...r, ticket_sales: h.sold, ticket_usage: h.used } : r
          )
        : prev
    );
    setDirty(true);
  }

  async function save() {
    if (!rows) return;
    setSaving(true);
    setMessage(null);
    // 入力のある日だけ upsert（全部0の日は保存しない）
    const payload = rows
      .filter((r) => r.spot_sales || r.ticket_sales || r.ticket_usage || r.product_sales)
      .map((r) => ({ ...r, store_id: storeId }));
    const { error } = await supabase
      .from("daily_sales")
      .upsert(payload, { onConflict: "date,store_id" });
    setMessage(error ? "保存に失敗しました" : "保存しました");
    if (!error) setDirty(false);
    setSaving(false);
  }

  const totals = (rows ?? []).reduce(
    (a, r) => ({
      spot: a.spot + r.spot_sales,
      sold: a.sold + r.ticket_sales,
      used: a.used + r.ticket_usage,
      product: a.product + r.product_sales,
    }),
    { spot: 0, sold: 0, used: 0, product: 0 }
  );

  return (
    <div className="space-y-5 fade-in">
      <AdminTabs />
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="serif text-3xl text-ink">実績入力</h1>
          <p className="text-sm text-muted mt-1">{monthLabelJa(month)} ・ 店舗ごとに入力します</p>
        </div>
        <MonthNav month={month} onChange={setMonth} />
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

      {rows === null ? (
        <ListSkeleton rows={8} />
      ) : (
        <Card className="p-4 space-y-3">
          <SectionTitle>日次売上</SectionTitle>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-xs text-muted border-b border-hairline">
                  <th className="text-left py-2 font-semibold w-20">日付</th>
                  <th className="text-right font-semibold">都度払い</th>
                  <th className="text-right font-semibold">回数券販売</th>
                  <th className="text-right font-semibold">回数券消化</th>
                  <th className="text-right font-semibold">物販</th>
                  <th className="text-right font-semibold">会計上</th>
                  <th className="text-right font-semibold">現金イン</th>
                  <th className="w-28" />
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {rows.map((r) => {
                  const h = hints[r.date];
                  const acc = r.spot_sales + r.ticket_usage + r.product_sales;
                  const cash = r.spot_sales + r.ticket_sales + r.product_sales;
                  return (
                    <tr key={r.date}>
                      <td className="py-1.5 text-ink tnum">{r.date.slice(8)}日</td>
                      {(
                        ["spot_sales", "ticket_sales", "ticket_usage", "product_sales"] as const
                      ).map((key) => (
                        <td key={key} className="text-right">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={r[key] || ""}
                            placeholder="0"
                            onChange={(e) => update(r.date, key, Number(e.target.value || 0))}
                            className="w-24 min-h-10 rounded-lg border border-hairline bg-surface px-2 text-right text-sm text-ink outline-none focus:border-gold tnum"
                          />
                        </td>
                      ))}
                      <td className="text-right text-muted tnum">{acc ? yen(acc) : "—"}</td>
                      <td className="text-right text-muted tnum">{cash ? yen(cash) : "—"}</td>
                      <td className="text-right">
                        {h && (h.sold > 0 || h.used > 0) && (
                          <button
                            type="button"
                            onClick={() => applyLinked(r.date)}
                            title={`カルテ連動値: 販売 ${yen(h.sold)} / 消化 ${yen(h.used)}`}
                            className="text-[11px] text-gold-dk underline underline-offset-2 hover:text-ink min-h-10 px-1"
                          >
                            連動値を反映
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-hairline text-ink font-semibold">
                  <td className="py-2">合計</td>
                  <td className="text-right tnum">{yen(totals.spot)}</td>
                  <td className="text-right tnum">{yen(totals.sold)}</td>
                  <td className="text-right tnum">{yen(totals.used)}</td>
                  <td className="text-right tnum">{yen(totals.product)}</td>
                  <td className="text-right tnum">{yen(totals.spot + totals.used + totals.product)}</td>
                  <td className="text-right tnum">{yen(totals.spot + totals.sold + totals.product)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-[11px] text-muted">
            「連動値を反映」はカルテの回数券販売・消化記録から計算した参考値を入力欄に転記します
          </p>
          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={saving || !dirty}>
              {saving ? "保存中…" : "この月を保存する"}
            </Button>
            {message && (
              <span className={`text-sm ${message.includes("失敗") ? "text-caution" : "text-ok"}`}>
                {message}
              </span>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
