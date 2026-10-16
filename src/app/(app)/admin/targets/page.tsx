"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { Button, Card, Chip, ListSkeleton, SectionTitle } from "@/components/ui";
import { AdminTabs } from "@/components/admin-tabs";
import {
  addMonths,
  fiscalYearLabel,
  fiscalYearStart,
  monthLabelJa,
  thisMonthJST,
  yen,
} from "@/lib/format";
import type { StoreMonthlyTarget } from "@/lib/types";

// 入力中は文字列で保持する（売上は万円。「132.5」の入力途中で値が崩れないように）
interface TargetInput {
  month: string;
  sales: string; // 万円
  newCustomers: string; // 件
}

const toYen = (man: string) => Math.round(Number(man || 0) * 10000);
const toCount = (s: string) => Number(s || 0);

// 店舗別の月次目標（売上・新規件数）。実績との比較は経営サマリーで表示する
export default function TargetSettingsPage() {
  const { stores, storeFilter } = useApp();
  const supabase = useMemo(() => createClient(), []);
  const [fyStart, setFyStart] = useState(() => fiscalYearStart(thisMonthJST()));
  const [storeId, setStoreId] = useState<number>(storeFilter ?? stores[0]?.id);
  const [rows, setRows] = useState<TargetInput[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    setDirty(false);
    setMessage(null);
    const { data } = await supabase
      .from("store_monthly_targets")
      .select("*")
      .eq("store_id", storeId)
      .gte("month", fyStart)
      .lt("month", addMonths(fyStart, 12));

    // 年度の12ヶ月分の行を用意（既存の目標をマージ）
    const byMonth = new Map(((data as StoreMonthlyTarget[]) ?? []).map((t) => [t.month, t]));
    setRows(
      Array.from({ length: 12 }, (_, i) => {
        const month = addMonths(fyStart, i);
        const t = byMonth.get(month);
        return {
          month,
          sales: t?.target_sales ? String(t.target_sales / 10000) : "",
          newCustomers: t?.target_new_customers ? String(t.target_new_customers) : "",
        };
      })
    );
  }, [supabase, storeId, fyStart]);

  useEffect(() => {
    load();
  }, [load]);

  function update(month: string, key: "sales" | "newCustomers", value: string) {
    setRows((prev) =>
      prev ? prev.map((r) => (r.month === month ? { ...r, [key]: value } : r)) : prev
    );
    setDirty(true);
    setMessage(null);
  }

  async function save() {
    if (!rows) return;
    // 空欄は 0（未設定）として保存する。消した月も 0 で上書きされる
    const payload = rows.map((r) => ({
      store_id: storeId,
      month: r.month,
      target_sales: toYen(r.sales),
      target_new_customers: toCount(r.newCustomers),
    }));
    const invalid = payload.some(
      (p) =>
        !Number.isFinite(p.target_sales) ||
        p.target_sales < 0 ||
        !Number.isInteger(p.target_new_customers) ||
        p.target_new_customers < 0
    );
    if (invalid) {
      setMessage("売上は0以上の数値、新規件数は0以上の整数で入力してください");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("store_monthly_targets")
      .upsert(payload, { onConflict: "store_id,month" });
    setMessage(error ? "保存に失敗しました" : "保存しました");
    if (!error) setDirty(false);
    setSaving(false);
  }

  const totals = (rows ?? []).reduce(
    (a, r) => ({
      sales: a.sales + toYen(r.sales),
      newCustomers: a.newCustomers + toCount(r.newCustomers),
    }),
    { sales: 0, newCustomers: 0 }
  );

  return (
    <div className="space-y-5 fade-in">
      <AdminTabs />
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="serif text-3xl text-ink">目標設定</h1>
          <p className="text-sm text-muted mt-1">
            {fiscalYearLabel(fyStart)} ・ 店舗ごとに月別の売上・新規件数の目標を入力します
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setFyStart(addMonths(fyStart, -12))}
            aria-label="前の年度"
            className="min-h-11 min-w-11 rounded-full text-xl text-muted hover:text-ink hover:bg-gold-soft transition-colors"
          >
            ‹
          </button>
          <span className="min-h-11 inline-flex items-center rounded-lg border border-hairline bg-surface px-3 text-sm text-ink tnum">
            {fiscalYearLabel(fyStart)}
          </span>
          <button
            type="button"
            onClick={() => setFyStart(addMonths(fyStart, 12))}
            aria-label="次の年度"
            className="min-h-11 min-w-11 rounded-full text-xl text-muted hover:text-ink hover:bg-gold-soft transition-colors"
          >
            ›
          </button>
        </div>
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
        <ListSkeleton rows={6} />
      ) : (
        <Card className="p-4 space-y-3">
          <SectionTitle>月別目標</SectionTitle>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="text-xs text-muted border-b border-hairline">
                  <th className="text-left py-2 font-semibold w-28">月</th>
                  <th className="text-right font-semibold">売上目標（万円）</th>
                  <th className="text-right font-semibold">新規目標（件）</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {rows.map((r) => {
                  const salesYen = toYen(r.sales);
                  return (
                    <tr key={r.month}>
                      <td className="py-1.5 text-ink tnum">{monthLabelJa(r.month)}</td>
                      <td className="text-right">
                        <div className="inline-flex items-center gap-2">
                          <span className="text-[11px] text-muted tnum">
                            {salesYen > 0 ? yen(salesYen) : ""}
                          </span>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="any"
                            value={r.sales}
                            placeholder="0"
                            onChange={(e) => update(r.month, "sales", e.target.value)}
                            aria-label={`${monthLabelJa(r.month)}の売上目標（万円）`}
                            className="w-24 min-h-10 rounded-lg border border-hairline bg-surface px-2 text-right text-sm text-ink outline-none focus:border-gold tnum"
                          />
                        </div>
                      </td>
                      <td className="text-right">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          value={r.newCustomers}
                          placeholder="0"
                          onChange={(e) => update(r.month, "newCustomers", e.target.value)}
                          aria-label={`${monthLabelJa(r.month)}の新規目標（件）`}
                          className="w-20 min-h-10 rounded-lg border border-hairline bg-surface px-2 text-right text-sm text-ink outline-none focus:border-gold tnum"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-hairline text-ink font-semibold">
                  <td className="py-2">年間合計</td>
                  <td className="text-right tnum">{yen(totals.sales)}</td>
                  <td className="text-right tnum">{totals.newCustomers.toLocaleString("ja-JP")}件</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-[11px] text-muted">
            売上は万円で入力します（135 ＝ ¥1,350,000）。空欄の月は未設定として扱います。
            実績との比較は「経営サマリー」に表示されます
          </p>
          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={saving || !dirty}>
              {saving ? "保存中…" : "この年度を保存する"}
            </Button>
            {message && (
              <span className={`text-sm ${message === "保存しました" ? "text-ok" : "text-caution"}`}>
                {message}
              </span>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
