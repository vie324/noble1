"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { Badge, Button, Card, Chip, EmptyState, ListSkeleton } from "@/components/ui";
import { addDays, dateSlash, timeHM, todayJST } from "@/lib/format";
import type { Customer, Staff, Visit } from "@/lib/types";

const PAGE_SIZE = 30;

interface VisitListRow extends Visit {
  customers: Pick<Customer, "id" | "name" | "kana">;
  staff: Pick<Staff, "id" | "name" | "icon_emoji"> | null;
  visit_menus: { menus: { name: string } | null }[];
}

type PeriodKey = "7d" | "30d" | "90d" | "all";
const periods: { key: PeriodKey; label: string }[] = [
  { key: "7d", label: "1週間" },
  { key: "30d", label: "1ヶ月" },
  { key: "90d", label: "3ヶ月" },
  { key: "all", label: "すべて" },
];

export default function VisitListPage() {
  const { storeFilter, storeName } = useApp();
  const supabase = useMemo(() => createClient(), []);

  const [rows, setRows] = useState<VisitListRow[] | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [unfilledOnly, setUnfilledOnly] = useState(false);
  const [staffId, setStaffId] = useState<number | null>(null);
  const [staffList, setStaffList] = useState<Staff[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("staff")
        .select("*")
        .eq("is_active", true)
        .order("id");
      setStaffList((data as Staff[]) ?? []);
    })();
  }, [supabase]);

  const load = useCallback(
    async (pageNo: number, append: boolean) => {
      if (!append) setRows(null);

      let query = supabase
        .from("visits")
        .select(
          `*,
           customers (id, name, kana),
           staff (id, name, icon_emoji),
           visit_menus (menus (name))`
        )
        .order("scheduled_at", { ascending: false })
        .range(pageNo * PAGE_SIZE, pageNo * PAGE_SIZE + PAGE_SIZE);

      if (storeFilter !== null) query = query.eq("store_id", storeFilter);
      if (unfilledOnly) query = query.eq("status", "scheduled");
      if (staffId !== null) query = query.eq("staff_id", staffId);
      if (period !== "all") {
        const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
        query = query.gte(
          "scheduled_at",
          new Date(`${addDays(todayJST(), -days)}T00:00:00+09:00`).toISOString()
        );
      }

      const { data } = await query;
      const fetched = (data as unknown as VisitListRow[]) ?? [];
      setHasMore(fetched.length > PAGE_SIZE);
      const pageRows = fetched.slice(0, PAGE_SIZE);
      setRows((prev) => (append && prev ? [...prev, ...pageRows] : pageRows));
    },
    [supabase, storeFilter, unfilledOnly, staffId, period]
  );

  useEffect(() => {
    setPage(0);
    load(0, false);
  }, [load]);

  return (
    <div className="space-y-5 fade-in">
      <div>
        <h1 className="serif text-3xl text-ink">カルテ一覧</h1>
        <p className="text-sm text-muted mt-1">{storeName(storeFilter)}</p>
      </div>

      {/* 絞り込み */}
      <Card className="p-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
          {periods.map((p) => (
            <Chip
              key={p.key}
              label={p.label}
              selected={period === p.key}
              onClick={() => setPeriod(p.key)}
            />
          ))}
          <Chip
            label="未記入のみ"
            selected={unfilledOnly}
            onClick={() => setUnfilledOnly(!unfilledOnly)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Chip label="担当: 全員" selected={staffId === null} onClick={() => setStaffId(null)} />
          {staffList.map((s) => (
            <Chip
              key={s.id}
              label={`${s.icon_emoji} ${s.name}`}
              selected={staffId === s.id}
              onClick={() => setStaffId(s.id)}
            />
          ))}
        </div>
      </Card>

      {rows === null ? (
        <ListSkeleton rows={6} />
      ) : rows.length === 0 ? (
        <Card className="p-4">
          <EmptyState message="条件に合うカルテがありません" />
        </Card>
      ) : (
        <>
          <ul className="space-y-2 stagger">
            {rows.map((v) => (
              <li key={v.id}>
                <Link href={`/visits/${v.id}`}>
                  <Card
                    hairline={false}
                    className={`p-4 flex items-center gap-3 hover:shadow-[var(--shadow-card-hover)] transition-shadow ${
                      v.status === "scheduled"
                        ? "border-l-4 border-l-warn"
                        : "border-l-4 border-l-ok"
                    }`}
                  >
                    <div className="shrink-0 text-center w-20">
                      <p className="text-sm text-ink tnum">{dateSlash(v.scheduled_at)}</p>
                      <p className="text-xs text-muted tnum">{timeHM(v.scheduled_at)}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-ink">{v.customers.name} 様</p>
                      <p className="text-xs text-muted truncate">
                        {v.staff ? `${v.staff.icon_emoji} ${v.staff.name}` : "担当未定"}
                        {v.visit_menus.length > 0 &&
                          ` ・ ${v.visit_menus.map((m) => m.menus?.name).filter(Boolean).join("・")}`}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {v.status === "scheduled" ? (
                        <Badge color="warn">未記入</Badge>
                      ) : (
                        <Badge color="ok">記入済み</Badge>
                      )}
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
          {hasMore && (
            <div className="text-center">
              <Button
                variant="secondary"
                onClick={() => {
                  const next = page + 1;
                  setPage(next);
                  load(next, true);
                }}
              >
                さらに読み込む
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
