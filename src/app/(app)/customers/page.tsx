"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { Card, EmptyState, ListSkeleton, TextField } from "@/components/ui";
import { FlagBadges, TicketAlertBadges } from "@/components/flags";
import type { Customer, CustomerFlag, CustomerTicket } from "@/lib/types";

const PAGE_SIZE = 30;

interface CustomerRow extends Customer {
  customer_flags: CustomerFlag[];
  customer_tickets: CustomerTicket[];
}

export default function CustomerListPage() {
  const { storeFilter, storeName } = useApp();
  const supabase = useMemo(() => createClient(), []);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (q: string) => {
      setRows(null);
      let query = supabase
        .from("customers")
        .select("*, customer_flags (*, flag_types (*)), customer_tickets (*)")
        .order("kana")
        .limit(PAGE_SIZE);

      if (storeFilter !== null) query = query.eq("primary_store_id", storeFilter);
      if (q.trim()) {
        const like = `%${q.trim()}%`;
        query = query.or(`name.ilike.${like},kana.ilike.${like},phone.ilike.${like}`);
      }
      const { data } = await query;
      setRows((data as unknown as CustomerRow[]) ?? []);
    },
    [supabase, storeFilter]
  );

  useEffect(() => {
    load(search);
    // 検索文字列の変更は debounce 側（handleSearch）で処理する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeFilter]);

  function handleSearch(q: string) {
    setSearch(q);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => load(q), 220);
  }

  return (
    <div className="space-y-5 fade-in">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="serif text-3xl text-ink">お客様</h1>
          <p className="text-sm text-muted mt-1">{storeName(storeFilter)}（主担当店舗）</p>
        </div>
      </div>

      <TextField
        label="お名前・カナ・電話番号で検索"
        placeholder="インクリメンタルサーチ（部分一致）"
        value={search}
        onChange={(e) => handleSearch(e.target.value)}
      />

      {rows === null ? (
        <ListSkeleton rows={6} />
      ) : rows.length === 0 ? (
        <Card className="p-4">
          <EmptyState message="該当するお客様が見つかりません" />
        </Card>
      ) : (
        <ul className="space-y-2 stagger">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/customers/${c.id}`}>
                <Card
                  hairline={false}
                  className="p-4 flex items-center gap-3 hover:shadow-[var(--shadow-card-hover)] transition-shadow"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-ink">{c.name} 様</span>
                      <span className="text-xs text-muted">{c.kana}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      <FlagBadges flags={c.customer_flags} />
                      <TicketAlertBadges tickets={c.customer_tickets} />
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted">
                    <p>{storeName(c.primary_store_id)}</p>
                    {c.phone && <p className="tnum mt-0.5">{c.phone}</p>}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
