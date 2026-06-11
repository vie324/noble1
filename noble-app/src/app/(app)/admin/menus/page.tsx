"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { Card, ListSkeleton, SectionTitle } from "@/components/ui";
import { AdminTabs, MonthNav } from "@/components/admin-tabs";
import { addMonths, monthLabelJa, thisMonthJST } from "@/lib/format";

// カルテ（来店記録）の実データから集計するメニュー・施術部位分析
interface MenuUsage {
  menu_id: number;
  menus: { name: string; price: number } | null;
  visits: { scheduled_at: string; store_id: number } | null;
}

interface PartUsage {
  body_part_id: number;
  body_parts: { name: string } | null;
  visits: { scheduled_at: string; store_id: number } | null;
}

export default function MenuAnalyticsPage() {
  const { storeFilter, storeName } = useApp();
  const supabase = useMemo(() => createClient(), []);
  const [month, setMonth] = useState(thisMonthJST());
  const [menuRows, setMenuRows] = useState<MenuUsage[] | null>(null);
  const [partRows, setPartRows] = useState<PartUsage[]>([]);

  const load = useCallback(async () => {
    setMenuRows(null);
    const from = `${addMonths(month, -5)}T00:00:00+09:00`;
    const to = `${addMonths(month, 1)}T00:00:00+09:00`;

    let menuQ = supabase
      .from("visit_menus")
      .select("menu_id, menus (name, price), visits!inner (scheduled_at, store_id)")
      .gte("visits.scheduled_at", from)
      .lt("visits.scheduled_at", to);
    let partQ = supabase
      .from("visit_body_parts")
      .select("body_part_id, body_parts (name), visits!inner (scheduled_at, store_id)")
      .gte("visits.scheduled_at", from)
      .lt("visits.scheduled_at", to);
    if (storeFilter !== null) {
      menuQ = menuQ.eq("visits.store_id", storeFilter);
      partQ = partQ.eq("visits.store_id", storeFilter);
    }

    const [m, p] = await Promise.all([menuQ, partQ]);
    setMenuRows((m.data as unknown as MenuUsage[]) ?? []);
    setPartRows((p.data as unknown as PartUsage[]) ?? []);
  }, [supabase, month, storeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const monthKey = (iso: string) =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date(iso)).slice(0, 7);

  // 当月のメニュー別回数ランキング
  const menuRanking = useMemo(() => {
    const counts = new Map<string, { name: string; count: number; price: number }>();
    for (const r of menuRows ?? []) {
      if (!r.visits || monthKey(r.visits.scheduled_at) !== month.slice(0, 7)) continue;
      const name = r.menus?.name ?? `メニュー${r.menu_id}`;
      const acc = counts.get(name) ?? { name, count: 0, price: r.menus?.price ?? 0 };
      acc.count += 1;
      counts.set(name, acc);
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [menuRows, month]);

  // 施術部位 × 月（直近6ヶ月）のクロス集計 — §10「部位ごとの月次回数」
  const months = useMemo(
    () => Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5).slice(0, 7)),
    [month]
  );
  const partMatrix = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const r of partRows) {
      if (!r.visits) continue;
      const name = r.body_parts?.name ?? `部位${r.body_part_id}`;
      const mk = monthKey(r.visits.scheduled_at);
      const row = map.get(name) ?? {};
      row[mk] = (row[mk] ?? 0) + 1;
      map.set(name, row);
    }
    return Array.from(map, ([name, byMonth]) => ({ name, byMonth })).sort(
      (a, b) =>
        (b.byMonth[month.slice(0, 7)] ?? 0) - (a.byMonth[month.slice(0, 7)] ?? 0)
    );
  }, [partRows, month]);

  const maxMenuCount = Math.max(1, ...menuRanking.map((m) => m.count));

  return (
    <div className="space-y-5 fade-in">
      <AdminTabs />
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="serif text-3xl text-ink">メニュー・部位分析</h1>
          <p className="text-sm text-muted mt-1">
            {monthLabelJa(month)} ・ {storeName(storeFilter)} ・ カルテ実データから自動集計
          </p>
        </div>
        <MonthNav month={month} onChange={setMonth} />
      </div>

      {menuRows === null ? (
        <ListSkeleton rows={5} />
      ) : (
        <>
          {/* メニュー別 当月回数 */}
          <Card className="p-4 space-y-3">
            <SectionTitle>人気メニュー（{monthLabelJa(month)}・施術回数）</SectionTitle>
            {menuRanking.length === 0 ? (
              <p className="text-sm text-muted">この月のカルテにメニュー記録がありません</p>
            ) : (
              <ul className="space-y-2.5">
                {menuRanking.map((m, i) => (
                  <li key={m.name} className="flex items-center gap-3">
                    <span className="serif text-gold-dk w-6 text-center shrink-0">{i + 1}</span>
                    <span className="w-56 shrink-0 text-sm text-ink truncate">{m.name}</span>
                    <div className="flex-1 h-5 rounded-full bg-base border border-hairline overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(m.count / maxMenuCount) * 100}%`,
                          background:
                            "linear-gradient(to right, var(--noble-gold), var(--noble-gold-dk))",
                        }}
                      />
                    </div>
                    <span className="w-12 shrink-0 text-right text-sm text-ink tnum">
                      {m.count}回
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* 部位 × 月 クロス集計 */}
          <Card className="p-4 space-y-3">
            <SectionTitle>施術部位ごとの月次回数（直近6ヶ月）</SectionTitle>
            {partMatrix.length === 0 ? (
              <p className="text-sm text-muted">部位の記録がまだありません</p>
            ) : (
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="text-xs text-muted border-b border-hairline">
                      <th className="text-left py-2 font-semibold">部位</th>
                      {months.map((m) => (
                        <th key={m} className="text-right font-semibold tnum">
                          {Number(m.slice(5, 7))}月
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {partMatrix.map((row) => (
                      <tr key={row.name}>
                        <td className="py-2 text-ink">{row.name}</td>
                        {months.map((m) => {
                          const v = row.byMonth[m] ?? 0;
                          const current = m === month.slice(0, 7);
                          return (
                            <td
                              key={m}
                              className={`text-right tnum ${
                                current ? "text-gold-dk font-semibold" : "text-muted"
                              }`}
                            >
                              {v || "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-muted">
              お客様との会話材料に。「先月は背中を◯回やりましたね」等にお使いください
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
