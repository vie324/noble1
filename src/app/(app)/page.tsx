"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { Badge, Button, Card, CountUp, EmptyState, ListSkeleton } from "@/components/ui";
import { FlagBadges, TicketAlertBadges } from "@/components/flags";
import { addDays, dateLabelJa, jstToISO, timeHM, todayJST } from "@/lib/format";
import type {
  Customer,
  CustomerFlag,
  CustomerNote,
  CustomerTicket,
  Visit,
} from "@/lib/types";

interface BoardVisit extends Visit {
  customers: Customer & {
    customer_flags: CustomerFlag[];
    customer_notes: CustomerNote[];
    customer_tickets: CustomerTicket[];
  };
  staff: { id: number; name: string; icon_emoji: string; theme_color: string } | null;
  visit_menus: { menu_id: number; menus: { name: string } | null }[];
}

export default function TodayBoardPage() {
  const { storeFilter, storeName } = useApp();
  const [date, setDate] = useState(todayJST());
  const [visits, setVisits] = useState<BoardVisit[] | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setVisits(null);
    const supabase = createClient();
    let query = supabase
      .from("visits")
      .select(
        `*,
         customers (*,
           customer_flags (*, flag_types (*)),
           customer_notes (*),
           customer_tickets (*)
         ),
         staff (id, name, icon_emoji, theme_color),
         visit_menus (menu_id, menus (name))`
      )
      .gte("scheduled_at", jstToISO(date, "00:00"))
      .lt("scheduled_at", jstToISO(addDays(date, 1), "00:00"))
      .order("scheduled_at");

    if (storeFilter !== null) query = query.eq("store_id", storeFilter);

    const { data, error } = await query;
    if (error) {
      console.error(error);
      setVisits([]);
      return;
    }
    setVisits((data as unknown as BoardVisit[]) ?? []);
  }, [date, storeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const unfilled = useMemo(
    () => (visits ?? []).filter((v) => v.status === "scheduled").length,
    [visits]
  );

  const isToday = date === todayJST();

  return (
    <div className="space-y-5 fade-in">
      {/* 日付ナビゲーション */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="serif text-3xl text-ink">
            {isToday ? "本日のご予約" : "ご来店ボード"}
          </h1>
          <p className="text-sm text-muted mt-1">
            {dateLabelJa(date)} ・ {storeName(storeFilter)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <DateNavButton label="前日" onClick={() => setDate(addDays(date, -1))}>
            ‹
          </DateNavButton>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="min-h-11 rounded-lg border border-hairline bg-surface px-2 text-sm text-ink outline-none focus:border-gold"
            aria-label="日付を選択"
          />
          <DateNavButton label="翌日" onClick={() => setDate(addDays(date, 1))}>
            ›
          </DateNavButton>
          {!isToday && (
            <Button variant="ghost" onClick={() => setDate(todayJST())}>
              今日へ
            </Button>
          )}
        </div>
      </div>

      {/* サマリー＋来店予定作成 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted">ご来店予定</p>
          <p className="serif text-3xl mt-1 text-ink">
            {visits === null ? "—" : <CountUp value={visits.length} />}
            <span className="text-sm ml-1">件</span>
          </p>
        </Card>
        <Card className={`p-4 ${unfilled > 0 ? "border-warn/50" : ""}`}>
          <p className={`text-xs ${unfilled > 0 ? "text-warn font-semibold" : "text-muted"}`}>
            未記入カルテ
          </p>
          <p className={`serif text-3xl mt-1 ${unfilled > 0 ? "text-warn" : "text-ok"}`}>
            {visits === null ? "—" : <CountUp value={unfilled} />}
            <span className="text-sm ml-1">件</span>
          </p>
        </Card>
        <div className="col-span-2 md:col-span-1 flex items-center">
          <Link href={`/visits/new?date=${date}`} className="w-full">
            <Button className="w-full">＋ 来店予定を作る</Button>
          </Link>
        </div>
      </div>

      {/* タイムライン */}
      {visits === null ? (
        <ListSkeleton rows={4} />
      ) : visits.length === 0 ? (
        <Card className="p-4">
          <EmptyState message="この日のご来店予定はまだありません">
            <Link href={`/visits/new?date=${date}`}>
              <Button variant="secondary">来店予定を作る</Button>
            </Link>
          </EmptyState>
        </Card>
      ) : (
        <ul className="space-y-3 stagger">
          {visits.map((v) => (
            <VisitRow
              key={v.id}
              visit={v}
              expanded={expandedId === v.id}
              onToggle={() =>
                setExpandedId(expandedId === v.id ? null : v.id)
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function DateNavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="min-h-11 min-w-11 rounded-full text-xl text-muted hover:text-ink hover:bg-gold-soft transition-colors"
    >
      {children}
    </button>
  );
}

function VisitRow({
  visit,
  expanded,
  onToggle,
}: {
  visit: BoardVisit;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { storeName } = useApp();
  const c = visit.customers;
  const unfilled = visit.status === "scheduled";
  const activeFlags = c.customer_flags.filter((f) => !f.resolved_at);
  const pinnedNotes = c.customer_notes.filter((n) => n.pinned);
  const menuNames = visit.visit_menus
    .map((m) => m.menus?.name)
    .filter(Boolean) as string[];

  return (
    <li>
      <Card
        className={`overflow-hidden transition-shadow ${
          unfilled ? "border-l-4 border-l-warn" : "border-l-4 border-l-ok"
        }`}
        hairline={false}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="w-full text-left p-4 flex items-start gap-3"
        >
          {/* 時刻 */}
          <div className="shrink-0 text-center w-14">
            <p className="serif text-xl text-ink tnum">{timeHM(visit.scheduled_at)}</p>
            <p className="text-[10px] text-muted mt-0.5">{storeName(visit.store_id)}</p>
          </div>

          {/* 本文 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-ink">{c.name} 様</span>
              {visit.staff && (
                <span className="text-xs text-muted">
                  {visit.staff.icon_emoji} {visit.staff.name}
                </span>
              )}
            </div>
            {menuNames.length > 0 && (
              <p className="text-sm text-muted mt-0.5 truncate">
                {menuNames.join("・")}
              </p>
            )}
            {(activeFlags.length > 0 || pinnedNotes.length > 0) && (
              <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                <FlagBadges flags={activeFlags} />
                {pinnedNotes.length > 0 && (
                  <Badge color="rose">📌 申し送り{pinnedNotes.length}件</Badge>
                )}
                <TicketAlertBadges tickets={c.customer_tickets} />
              </div>
            )}
          </div>

          {/* ステータス */}
          <div className="shrink-0">
            {unfilled ? (
              <Badge color="warn">未記入</Badge>
            ) : (
              <Badge color="ok">記入済み</Badge>
            )}
          </div>
        </button>

        {/* 来店前チェック（タップで申し送り全文） */}
        {expanded && (
          <div className="px-4 pb-4 fade-in">
            <div className="rounded-xl bg-base border border-hairline p-3 space-y-2">
              {activeFlags.length === 0 && pinnedNotes.length === 0 && !c.booking_memo ? (
                <p className="text-sm text-muted">申し送り事項はありません</p>
              ) : (
                <>
                  {activeFlags
                    .filter((f) => f.note)
                    .map((f) => (
                      <p key={f.id} className="text-sm text-caution font-medium">
                        ⚠ {f.flag_types?.name}：{f.note}
                      </p>
                    ))}
                  {pinnedNotes.map((n) => (
                    <p key={n.id} className="text-sm text-ink">
                      📌 {n.body}
                    </p>
                  ))}
                  {c.booking_memo && (
                    <p className="text-sm text-muted">予約メモ：{c.booking_memo}</p>
                  )}
                </>
              )}
              <div className="flex gap-2 pt-1">
                <Link href={`/visits/${visit.id}`}>
                  <Button variant={unfilled ? "primary" : "secondary"}>
                    {unfilled ? "カルテを記入する" : "カルテを開く"}
                  </Button>
                </Link>
                <Link href={`/customers/${c.id}`}>
                  <Button variant="ghost">お客様ページ</Button>
                </Link>
                {c.line_chat_url && (
                  <a href={c.line_chat_url} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost">LINEを開く</Button>
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>
    </li>
  );
}
