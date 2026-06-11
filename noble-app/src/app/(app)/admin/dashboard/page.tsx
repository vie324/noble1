"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { Card, CountUp, ListSkeleton, SectionTitle } from "@/components/ui";
import { AdminTabs, MonthNav } from "@/components/admin-tabs";
import { addMonths, daysUntil, monthLabelJa, thisMonthJST, yen } from "@/lib/format";
import { ticketUnusedAmount } from "@/lib/types";
import type { CustomerTicket } from "@/lib/types";

interface DailySale {
  id: number;
  date: string;
  store_id: number;
  spot_sales: number;
  ticket_sales: number;
  ticket_usage: number;
  product_sales: number;
}

interface MediaRow {
  id: number;
  month: string;
  new_visits: number;
  sales: number;
  media_sources: { name: string } | null;
}

interface StaffMonthlyRow {
  retention_rate: number;
}

const CHART_COLORS = {
  spot: "#B89B5E", // ゴールド: 都度払い
  usage: "#C98D8D", // ローズ: 回数券消化
  product: "#8E8276", // モーブ: 物販
  cash: "#3D352E", // インク: キャッシュイン（線）
};

export default function AdminDashboardPage() {
  const { storeFilter, storeName } = useApp();
  const supabase = useMemo(() => createClient(), []);
  const [month, setMonth] = useState(thisMonthJST());

  const [sales, setSales] = useState<DailySale[] | null>(null);
  const [tickets, setTickets] = useState<CustomerTicket[]>([]);
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [retention, setRetention] = useState<number | null>(null);

  const load = useCallback(async () => {
    setSales(null);
    const chartFrom = addMonths(month, -5);
    const monthEnd = addMonths(month, 1);

    let salesQ = supabase
      .from("daily_sales")
      .select("*")
      .gte("date", chartFrom)
      .lt("date", monthEnd)
      .order("date");
    if (storeFilter !== null) salesQ = salesQ.eq("store_id", storeFilter);

    let ticketsQ = supabase.from("customer_tickets").select("*");
    if (storeFilter !== null) ticketsQ = ticketsQ.eq("store_id", storeFilter);

    const [s, t, m, st] = await Promise.all([
      salesQ,
      ticketsQ,
      supabase
        .from("media_monthly")
        .select("*, media_sources (name)")
        .eq("month", month)
        .order("new_visits", { ascending: false }),
      supabase.from("staff_monthly").select("retention_rate").eq("month", month),
    ]);

    setSales((s.data as DailySale[]) ?? []);
    setTickets((t.data as CustomerTicket[]) ?? []);
    setMedia((m.data as unknown as MediaRow[]) ?? []);
    const rates = ((st.data as StaffMonthlyRow[]) ?? []).map((r) => Number(r.retention_rate));
    setRetention(rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null);
  }, [supabase, month, storeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // 当月KPI
  const monthRows = (sales ?? []).filter((r) => r.date.startsWith(month.slice(0, 7)));
  const sum = (f: (r: DailySale) => number) => monthRows.reduce((a, r) => a + f(r), 0);
  const accounting = sum((r) => r.spot_sales + r.ticket_usage + r.product_sales);
  const cashIn = sum((r) => r.spot_sales + r.ticket_sales + r.product_sales);
  const ticketUsageTotal = sum((r) => r.ticket_usage);
  const ticketSalesTotal = sum((r) => r.ticket_sales);

  // 回数券未消化残高（カルテ連動の実データ）
  const unusedBalance = tickets
    .filter((t) => t.remaining_count > 0 && daysUntil(t.expires_at) >= 0)
    .reduce((a, t) => a + ticketUnusedAmount(t), 0);

  // 月次推移（直近6ヶ月）
  const chartData = useMemo(() => {
    const byMonth = new Map<string, { spot: number; usage: number; product: number; cash: number }>();
    for (let i = 5; i >= 0; i--) {
      byMonth.set(addMonths(month, -i).slice(0, 7), { spot: 0, usage: 0, product: 0, cash: 0 });
    }
    for (const r of sales ?? []) {
      const key = r.date.slice(0, 7);
      const acc = byMonth.get(key);
      if (!acc) continue;
      acc.spot += r.spot_sales;
      acc.usage += r.ticket_usage;
      acc.product += r.product_sales;
      acc.cash += r.spot_sales + r.ticket_sales + r.product_sales;
    }
    return Array.from(byMonth, ([key, v]) => ({
      name: `${Number(key.slice(5, 7))}月`,
      都度払い: v.spot,
      回数券消化: v.usage,
      物販: v.product,
      キャッシュイン: v.cash,
    }));
  }, [sales, month]);

  const maxNewVisits = Math.max(1, ...media.map((m) => m.new_visits));

  return (
    <div className="space-y-5 fade-in">
      <AdminTabs />
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="serif text-3xl text-ink">経営サマリー</h1>
          <p className="text-sm text-muted mt-1">
            {monthLabelJa(month)} ・ {storeName(storeFilter)}
          </p>
        </div>
        <MonthNav month={month} onChange={setMonth} />
      </div>

      {sales === null ? (
        <ListSkeleton rows={4} />
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
            <KpiCard
              title="会計上売上（役務消化込）"
              value={accounting}
              sub={`うち消化 ${yen(ticketUsageTotal)}`}
            />
            <KpiCard
              title="キャッシュイン（入金総額）"
              value={cashIn}
              sub={`うち回数券販売 ${yen(ticketSalesTotal)}`}
            />
            <KpiCard
              title="回数券未消化残高"
              value={unusedBalance}
              sub="カルテ連動・現在値"
              tone="dark"
            />
            <Card className="p-4">
              <p className="text-xs text-muted">平均リピート率</p>
              <p className="serif text-3xl mt-1 text-ink tnum">
                {retention === null ? "—" : `${retention.toFixed(1)}%`}
              </p>
              <p className="text-[11px] text-muted mt-1">スタッフ実績の平均</p>
            </Card>
          </div>

          {/* 売上構造分析 */}
          <Card className="p-4 space-y-3">
            <SectionTitle>売上構造分析（直近6ヶ月）</SectionTitle>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
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
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #E8E0D4",
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="都度払い" stackId="a" fill={CHART_COLORS.spot} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="回数券消化" stackId="a" fill={CHART_COLORS.usage} />
                  <Bar dataKey="物販" stackId="a" fill={CHART_COLORS.product} radius={[6, 6, 0, 0]} />
                  <Line
                    type="monotone"
                    dataKey="キャッシュイン"
                    stroke={CHART_COLORS.cash}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-muted">
              積み上げ＝会計上売上（都度払い＋回数券消化＋物販）／ 線＝キャッシュイン
            </p>
          </Card>

          {/* 媒体別新規集客 */}
          <Card className="p-4 space-y-3">
            <SectionTitle>媒体別 新規集客（{monthLabelJa(month)}）</SectionTitle>
            {media.length === 0 ? (
              <p className="text-sm text-muted">
                この月の媒体実績は未入力です（「売上・媒体」タブから入力できます）
              </p>
            ) : (
              <ul className="space-y-2.5">
                {media.map((m) => (
                  <li key={m.id} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 text-sm text-ink truncate">
                      {m.media_sources?.name ?? "—"}
                    </span>
                    <div className="flex-1 h-5 rounded-full bg-base border border-hairline overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(m.new_visits / maxNewVisits) * 100}%`,
                          background:
                            "linear-gradient(to right, var(--noble-gold), var(--noble-gold-dk))",
                        }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right text-sm text-ink tnum">
                      {m.new_visits}名
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function KpiCard({
  title,
  value,
  sub,
  tone = "light",
}: {
  title: string;
  value: number;
  sub?: string;
  tone?: "light" | "dark";
}) {
  return (
    <div
      className={`noble-card p-4 ${tone !== "dark" ? "gold-hairline" : ""}`}
      style={
        tone === "dark"
          ? { background: "var(--noble-text)", borderColor: "var(--noble-text)" }
          : undefined
      }
    >
      <p className={`text-xs ${tone === "dark" ? "text-[#D9CBB0]" : "text-muted"}`}>{title}</p>
      <p
        className={`serif text-2xl lg:text-[26px] mt-1 ${
          tone === "dark" ? "text-[#F3ECDD]" : "text-ink"
        }`}
      >
        <CountUp value={value} format={(n) => yen(n)} />
      </p>
      {sub && (
        <p className={`text-[11px] mt-1 tnum ${tone === "dark" ? "text-[#B5A88F]" : "text-muted"}`}>
          {sub}
        </p>
      )}
    </div>
  );
}
