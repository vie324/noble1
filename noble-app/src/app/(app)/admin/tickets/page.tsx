"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { Badge, Card, CountUp, EmptyState, ListSkeleton, SectionTitle } from "@/components/ui";
import { dateSlash, daysUntil, ticketLabel, yen } from "@/lib/format";
import { ticketUnusedAmount } from "@/lib/types";
import type { CustomerTicket } from "@/lib/types";

interface TicketRow extends CustomerTicket {
  customers: { id: number; name: string; kana: string } | null;
}

// 回数券未消化残高（前受金）ダッシュボード — 管理者専用
export default function AdminTicketsPage() {
  const { storeFilter, storeName, stores } = useApp();
  const supabase = useMemo(() => createClient(), []);
  const [tickets, setTickets] = useState<TicketRow[] | null>(null);

  const load = useCallback(async () => {
    setTickets(null);
    let query = supabase
      .from("customer_tickets")
      .select("*, ticket_products (*), customers (id, name, kana)")
      .order("expires_at");
    if (storeFilter !== null) query = query.eq("store_id", storeFilter);
    const { data } = await query;
    setTickets((data as unknown as TicketRow[]) ?? []);
  }, [supabase, storeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const valid = (tickets ?? []).filter(
    (t) => daysUntil(t.expires_at) >= 0 && t.remaining_count > 0
  );
  const totalUnused = valid.reduce((sum, t) => sum + ticketUnusedAmount(t), 0);

  // 店舗別内訳（全店舗表示時のみ）
  const byStore = stores.map((s) => ({
    store: s,
    amount: valid
      .filter((t) => t.store_id === s.id)
      .reduce((sum, t) => sum + ticketUnusedAmount(t), 0),
  }));

  // アラート: 期限30日以内 or 残1回
  const alerts = valid.filter(
    (t) => daysUntil(t.expires_at) <= 30 || t.remaining_count === 1
  );
  // 期限切れだが残回数のある券（返金・トラブル対応用）
  const expiredWithRemaining = (tickets ?? []).filter(
    (t) => daysUntil(t.expires_at) < 0 && t.remaining_count > 0
  );

  return (
    <div className="space-y-5 fade-in">
      <div>
        <h1 className="serif text-3xl text-ink">回数券残高</h1>
        <p className="text-sm text-muted mt-1">
          {storeName(storeFilter)} ・ 前受金（未消化の役務提供義務）
        </p>
      </div>

      {tickets === null ? (
        <ListSkeleton rows={4} />
      ) : (
        <>
          {/* KPI */}
          <Card className="p-6 text-center">
            <p className="text-xs text-muted tracking-widest">回数券未消化残高</p>
            <p className="serif text-5xl text-gold-dk mt-2">
              <CountUp value={totalUnused} format={(n) => yen(n)} />
            </p>
            <p className="text-xs text-muted mt-2 tnum">
              有効な回数券 {valid.length} 枚 ・ 残回数合計{" "}
              {valid.reduce((s, t) => s + t.remaining_count, 0)} 回
            </p>
            {storeFilter === null && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {byStore.map(({ store, amount }) => (
                  <div key={store.id} className="rounded-xl bg-base border border-hairline p-3">
                    <p className="text-xs text-muted">{store.name}</p>
                    <p className="serif text-lg text-ink mt-1 tnum">{yen(amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* アラート */}
          <Card className="p-4 space-y-3">
            <SectionTitle>要フォロー（期限30日以内・残り1回）</SectionTitle>
            {alerts.length === 0 ? (
              <EmptyState message="要フォローのお客様はいません" />
            ) : (
              <ul className="divide-y divide-hairline">
                {alerts.map((t) => (
                  <AlertRow key={t.id} ticket={t} />
                ))}
              </ul>
            )}
          </Card>

          {expiredWithRemaining.length > 0 && (
            <Card className="p-4 space-y-3 border-caution/40">
              <SectionTitle>期限切れ・残回数あり（要対応）</SectionTitle>
              <ul className="divide-y divide-hairline">
                {expiredWithRemaining.map((t) => (
                  <AlertRow key={t.id} ticket={t} expired />
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function AlertRow({ ticket: t, expired = false }: { ticket: TicketRow; expired?: boolean }) {
  const days = daysUntil(t.expires_at);
  return (
    <li className="py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <Link
          href={`/customers/${t.customers?.id}`}
          className="font-semibold text-ink hover:text-gold-dk transition-colors"
        >
          {t.customers?.name ?? "—"} 様
        </Link>
        <p className="text-xs text-muted mt-0.5 tnum">
          {ticketLabel(t)} ・ 残 {t.remaining_count}/{t.total_count} 回 ・ 未消化{" "}
          {yen(ticketUnusedAmount(t))} ・ 期限 {dateSlash(t.expires_at)}
        </p>
      </div>
      <div className="flex gap-1.5 shrink-0">
        {expired ? (
          <Badge color="caution">期限切れ</Badge>
        ) : (
          days <= 30 && <Badge color="warn">あと{days}日</Badge>
        )}
        {t.remaining_count === 1 && !expired && <Badge color="rose">残り1回</Badge>}
      </div>
    </li>
  );
}
