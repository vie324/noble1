"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Line,
  LineChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { Button, Card, ListSkeleton, SectionTitle } from "@/components/ui";
import { AdminTabs, MonthNav } from "@/components/admin-tabs";
import { addMonths, monthLabelJa, thisMonthJST, yen } from "@/lib/format";

interface MediaSource {
  id: number;
  name: string;
  is_active: boolean;
}

interface MediaRow {
  id?: number;
  month: string;
  media_source_id: number;
  new_visits: number;
  repeat_rate: number;
  sales: number;
  ad_cost: number;
}

interface DailySale {
  date: string;
  store_id: number;
  spot_sales: number;
  ticket_sales: number;
  ticket_usage: number;
  product_sales: number;
}

export default function AnalyticsPage() {
  const { storeFilter, storeName } = useApp();
  const supabase = useMemo(() => createClient(), []);
  const [month, setMonth] = useState(thisMonthJST());

  const [sources, setSources] = useState<MediaSource[]>([]);
  const [rows, setRows] = useState<MediaRow[] | null>(null);
  const [sales, setSales] = useState<DailySale[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    setDirty(false);
    const chartFrom = addMonths(month, -5);
    const monthEnd = addMonths(month, 1);

    let salesQ = supabase
      .from("daily_sales")
      .select("*")
      .gte("date", chartFrom)
      .lt("date", monthEnd);
    if (storeFilter !== null) salesQ = salesQ.eq("store_id", storeFilter);

    const [src, mm, s] = await Promise.all([
      supabase.from("media_sources").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("media_monthly").select("*").eq("month", month).is("store_id", null),
      salesQ,
    ]);

    const sourceList = (src.data as MediaSource[]) ?? [];
    setSources(sourceList);
    const existing = new Map(
      ((mm.data as MediaRow[]) ?? []).map((r) => [r.media_source_id, r])
    );
    // 全媒体分の行を用意（未入力はゼロ行）
    setRows(
      sourceList.map(
        (src) =>
          existing.get(src.id) ?? {
            month,
            media_source_id: src.id,
            new_visits: 0,
            repeat_rate: 0,
            sales: 0,
            ad_cost: 0,
          }
      )
    );
    setSales((s.data as DailySale[]) ?? []);
  }, [supabase, month, storeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  function update(sourceId: number, key: keyof MediaRow, value: number) {
    setRows((prev) =>
      prev
        ? prev.map((r) => (r.media_source_id === sourceId ? { ...r, [key]: value } : r))
        : prev
    );
    setDirty(true);
    setMessage(null);
  }

  async function save() {
    if (!rows) return;
    setSaving(true);
    const payload = rows
      .filter((r) => r.new_visits || r.sales || r.ad_cost || r.repeat_rate)
      .map((r) => ({ ...r, store_id: null }));
    const { error } = await supabase
      .from("media_monthly")
      .upsert(payload, { onConflict: "month,media_source_id,store_id" });
    setMessage(error ? "保存に失敗しました" : "保存しました");
    if (!error) {
      setDirty(false);
      await load();
    }
    setSaving(false);
  }

  // キャッシュイン vs 役務消化（直近6ヶ月）
  const trend = useMemo(() => {
    const byMonth = new Map<string, { cash: number; usage: number }>();
    for (let i = 5; i >= 0; i--) {
      byMonth.set(addMonths(month, -i).slice(0, 7), { cash: 0, usage: 0 });
    }
    for (const r of sales) {
      const acc = byMonth.get(r.date.slice(0, 7));
      if (!acc) continue;
      acc.cash += r.spot_sales + r.ticket_sales + r.product_sales;
      acc.usage += r.ticket_usage;
    }
    return Array.from(byMonth, ([k, v]) => ({
      name: `${Number(k.slice(5, 7))}月`,
      キャッシュイン: v.cash,
      役務消化: v.usage,
    }));
  }, [sales, month]);

  return (
    <div className="space-y-5 fade-in">
      <AdminTabs />
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="serif text-3xl text-ink">売上・媒体分析</h1>
          <p className="text-sm text-muted mt-1">
            {monthLabelJa(month)} ・ {storeName(storeFilter)}
          </p>
        </div>
        <MonthNav month={month} onChange={setMonth} />
      </div>

      {rows === null ? (
        <ListSkeleton rows={5} />
      ) : (
        <>
          {/* 媒体別パフォーマンス（全店舗合算で入力） */}
          <Card className="p-4 space-y-3">
            <SectionTitle>媒体別パフォーマンス（全店舗・{monthLabelJa(month)}）</SectionTitle>
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-xs text-muted border-b border-hairline">
                    <th className="text-left py-2 font-semibold">媒体</th>
                    <th className="text-right font-semibold">新規来店</th>
                    <th className="text-right font-semibold">リピート率%</th>
                    <th className="text-right font-semibold">売上</th>
                    <th className="text-right font-semibold">広告費</th>
                    <th className="text-right font-semibold">CPA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {rows.map((r) => {
                    const src = sources.find((s) => s.id === r.media_source_id);
                    const cpa = r.new_visits > 0 ? Math.round(r.ad_cost / r.new_visits) : null;
                    return (
                      <tr key={r.media_source_id}>
                        <td className="py-1.5 text-ink">{src?.name}</td>
                        {(["new_visits", "repeat_rate", "sales", "ad_cost"] as const).map(
                          (key) => (
                            <td key={key} className="text-right">
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                value={r[key] || ""}
                                placeholder="0"
                                onChange={(e) =>
                                  update(r.media_source_id, key, Number(e.target.value || 0))
                                }
                                className="w-24 min-h-10 rounded-lg border border-hairline bg-surface px-2 text-right text-sm text-ink outline-none focus:border-gold tnum"
                              />
                            </td>
                          )
                        )}
                        <td className="text-right text-muted tnum">
                          {cpa === null ? "—" : yen(cpa)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={save} disabled={saving || !dirty}>
                {saving ? "保存中…" : "保存する"}
              </Button>
              {message && (
                <span
                  className={`text-sm ${message.includes("失敗") ? "text-caution" : "text-ok"}`}
                >
                  {message}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted">
              CPA ＝ 広告費 ÷ 新規来店数（自動計算）。媒体の追加はマスタ管理は不要、管理者にご相談ください
            </p>
          </Card>

          {/* キャッシュイン vs 役務消化 */}
          <Card className="p-4 space-y-3">
            <SectionTitle>キャッシュイン vs 役務消化（直近6ヶ月）</SectionTitle>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <XAxis dataKey="name" stroke="#8E8276" fontSize={12} tickLine={false} />
                  <YAxis
                    stroke="#8E8276"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v: number) => `${Math.round(v / 10000)}万`}
                    width={44}
                  />
                  <Tooltip
                    formatter={(v) => yen(Number(v))}
                    contentStyle={{ borderRadius: 12, border: "1px solid #E8E0D4", fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="キャッシュイン"
                    stroke="#B89B5E"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="役務消化"
                    stroke="#C98D8D"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-muted">
              キャッシュインが役務消化を継続的に下回ると、前受金（未消化残高）を取り崩している状態です
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
