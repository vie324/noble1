"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { Button, Card, Chip, ListSkeleton, SectionTitle, TextField } from "@/components/ui";
import { ShiftTabs } from "@/components/shift-tabs";
import { MonthNav } from "@/components/admin-tabs";
import {
  addMonths,
  dateLabelJa,
  monthLabelJa,
  shiftChipLabel,
  thisMonthJST,
  timeShort,
  todayJST,
  WEEKDAYS_JA, staffLabel } from "@/lib/format";
import { EVENT_TYPE_META } from "@/lib/types";
import type { CalendarEvent, EventType, Shift } from "@/lib/types";

// イベント種別 → チップ配色（変更=深紅で強調）
const eventChipClass: Record<string, string> = {
  caution: "bg-caution text-white border-caution font-semibold",
  warn: "bg-warn-soft text-warn border-warn/40",
  ok: "bg-ok-soft text-ok border-ok/40",
  rose: "bg-rose-soft text-rose border-rose/40",
  gold: "bg-gold-soft text-gold-dk border-gold/40",
};

export default function CalendarPage() {
  const { storeFilter, storeName, stores, isAdmin, me } = useApp();
  const supabase = useMemo(() => createClient(), []);
  const [month, setMonth] = useState(thisMonthJST());
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  // 日を選んだら詳細パネルへスムーズにスクロール（クリックでそのまま設定できる導線）
  useEffect(() => {
    if (selectedDate && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedDate]);

  const monthEnd = addMonths(month, 1);

  const load = useCallback(async () => {
    setShifts(null);
    let shiftQ = supabase
      .from("shifts")
      .select("*, staff (id, name, icon_emoji, theme_color)")
      .eq("status", "confirmed")
      .gte("date", month)
      .lt("date", monthEnd)
      .order("start_time");
    if (storeFilter !== null) shiftQ = shiftQ.eq("store_id", storeFilter);

    const [s, e] = await Promise.all([
      shiftQ,
      // 当月の単発予定 ＋ 繰り返し予定（クライアント側で展開）
      supabase
        .from("calendar_events")
        .select("*")
        .or(`and(date.gte.${month},date.lt.${monthEnd}),repeat_weekday.not.is.null`),
    ]);
    setShifts((s.data as unknown as Shift[]) ?? []);
    setEvents((e.data as CalendarEvent[]) ?? []);
  }, [supabase, month, monthEnd, storeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // 月のカレンダーグリッド（日曜始まり）
  const days = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const daysInMonth = new Date(y, m, 0).getDate();
    const offset = first.getUTCDay();
    const cells: (string | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${month.slice(0, 7)}-${String(d).padStart(2, "0")}`);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [month]);

  // 店舗フィルタ適用済みイベントを日付ごとに展開
  const eventsFor = useCallback(
    (date: string): CalendarEvent[] => {
      // 正午+09:00 で生成するとローカルTZに関わらず日本時間と同じ曜日になる
      const jstWeekday = new Date(`${date}T12:00:00+09:00`).getUTCDay();
      return events.filter((e) => {
        if (storeFilter !== null && e.store_id !== null && e.store_id !== storeFilter)
          return false;
        if (e.repeat_weekday !== null) {
          return (
            e.repeat_weekday === jstWeekday &&
            e.date <= date &&
            (!e.repeat_until || e.repeat_until >= date)
          );
        }
        return e.date === date;
      });
    },
    [events, storeFilter]
  );

  const shiftsFor = useCallback(
    (date: string) => (shifts ?? []).filter((s) => s.date === date),
    [shifts]
  );

  return (
    <div className="space-y-5 fade-in">
      <ShiftTabs />
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="serif text-3xl text-ink">{monthLabelJa(month)}</h1>
          <p className="text-sm text-muted mt-1">{storeName(storeFilter)} ・ 共有カレンダー</p>
        </div>
        <MonthNav month={month} onChange={setMonth} />
      </div>

      {shifts === null ? (
        <ListSkeleton rows={6} />
      ) : (
        <Card className="p-2 sm:p-3 overflow-hidden">
          {/* 曜日ヘッダー */}
          <div className="grid grid-cols-7 text-center text-[11px] text-muted font-semibold border-b border-hairline pb-1 mb-1">
            {WEEKDAYS_JA.map((w, i) => (
              <div key={w} className={i === 0 ? "text-rose" : i === 6 ? "text-gold-dk" : ""}>
                {w}
              </div>
            ))}
          </div>
          {/* 日セル */}
          <div className="grid grid-cols-7">
            {days.map((date, i) => (
              <DayCell
                key={i}
                date={date}
                shifts={date ? shiftsFor(date) : []}
                events={date ? eventsFor(date) : []}
                selected={selectedDate === date}
                onSelect={() => date && setSelectedDate(selectedDate === date ? null : date)}
              />
            ))}
          </div>
        </Card>
      )}

      {/* 選択日の詳細＋予定追加 */}
      {selectedDate && (
        <div ref={detailRef}>
          <DayDetail
            key={selectedDate}
            date={selectedDate}
            shifts={shiftsFor(selectedDate)}
            events={eventsFor(selectedDate)}
            stores={stores}
            isAdmin={isAdmin}
            myAuthId={me.auth_user_id}
            autoOpenAdd={
              shiftsFor(selectedDate).length === 0 && eventsFor(selectedDate).length === 0
            }
            onChanged={load}
          />
        </div>
      )}

      {/* Googleカレンダー連携（管理者） */}
      {isAdmin && <GoogleSyncCard />}
    </div>
  );
}

// Googleカレンダー購読（iCal）の案内
function GoogleSyncCard() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/api/ics?key=（設定したシークレット）`;
  return (
    <Card className="p-4 space-y-2">
      <SectionTitle>Googleカレンダー連携</SectionTitle>
      <p className="text-sm text-muted">
        確定シフト・共有予定を Google カレンダーで購読できます（読み取り専用・自動更新）。
      </p>
      <ol className="text-sm text-ink list-decimal pl-5 space-y-1">
        <li>
          Vercel の環境変数 <code className="bg-base px-1 rounded">ICAL_FEED_SECRET</code>{" "}
          に任意の文字列を設定して再デプロイ
        </li>
        <li>
          Google カレンダー →「他のカレンダー」→「URL で追加」に次を貼り付け：
          <span className="block mt-1 text-xs bg-base border border-hairline rounded-lg px-2 py-1.5 break-all tnum">
            {url}
          </span>
        </li>
      </ol>
      <p className="text-[11px] text-muted">
        ※ シフトを確定・変更すると、Google 側にも数時間以内に反映されます。
      </p>
    </Card>
  );
}

function DayCell({
  date,
  shifts,
  events,
  selected,
  onSelect,
}: {
  date: string | null;
  shifts: Shift[];
  events: CalendarEvent[];
  selected: boolean;
  onSelect: () => void;
}) {
  if (!date) return <div className="min-h-20 border-b border-r border-hairline/50" />;
  const isToday = date === todayJST();
  const total = shifts.length + events.length;
  const visible = 4;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={dateLabelJa(date)}
      className={`min-h-20 sm:min-h-24 border-b border-r border-hairline/50 p-0.5 sm:p-1 text-left align-top transition-colors ${
        selected ? "bg-gold-soft/60" : "hover:bg-gold-soft/30"
      }`}
    >
      <span
        className={`inline-flex items-center justify-center w-5 h-5 text-[11px] tnum rounded-full ${
          isToday ? "bg-gold text-white font-bold" : "text-ink"
        }`}
      >
        {Number(date.slice(8))}
      </span>
      <div className="space-y-0.5 mt-0.5">
        {/* シフトチップ: 「🐨 10-19」をスタッフカラーで */}
        {shifts.slice(0, visible).map((s) => (
          <div
            key={`s${s.id}`}
            className="truncate rounded px-1 py-px text-[9px] sm:text-[10px] leading-tight border tnum"
            style={{
              background: `${s.staff?.theme_color ?? "#B89B5E"}1f`,
              borderColor: `${s.staff?.theme_color ?? "#B89B5E"}55`,
              color: "var(--noble-text)",
            }}
          >
            {shiftChipLabel(s.staff?.icon_emoji ?? "", s.start_time, s.end_time)}
          </div>
        ))}
        {events.slice(0, Math.max(0, visible - shifts.length)).map((e) => (
          <div
            key={`e${e.id}`}
            className={`truncate rounded px-1 py-px text-[9px] sm:text-[10px] leading-tight border ${
              eventChipClass[EVENT_TYPE_META[e.type].color]
            }`}
          >
            {e.title}
          </div>
        ))}
        {total > visible && (
          <div className="text-[9px] text-muted pl-1">＋{total - visible}件</div>
        )}
      </div>
    </button>
  );
}

function DayDetail({
  date,
  shifts,
  events,
  stores,
  isAdmin,
  myAuthId,
  autoOpenAdd = false,
  onChanged,
}: {
  date: string;
  shifts: Shift[];
  events: CalendarEvent[];
  stores: { id: number; name: string }[];
  isAdmin: boolean;
  myAuthId: string | null;
  autoOpenAdd?: boolean;
  onChanged: () => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [adding, setAdding] = useState(autoOpenAdd);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<EventType>("todo");
  const [storeId, setStoreId] = useState<number | null>(null);
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [busy, setBusy] = useState(false);

  const jstWeekday = new Date(`${date}T12:00:00+09:00`).getUTCDay();

  async function addEvent() {
    if (!title.trim()) return;
    setBusy(true);
    await supabase.from("calendar_events").insert({
      date,
      type,
      title: title.trim(),
      store_id: storeId,
      repeat_weekday: repeatWeekly ? jstWeekday : null,
    });
    setTitle("");
    setAdding(false);
    await onChanged();
    setBusy(false);
  }

  async function deleteEvent(e: CalendarEvent) {
    if (!window.confirm(`「${e.title}」を削除しますか？${e.repeat_weekday !== null ? "（繰り返し予定全体が削除されます）" : ""}`))
      return;
    setBusy(true);
    await supabase.from("calendar_events").delete().eq("id", e.id);
    await onChanged();
    setBusy(false);
  }

  return (
    <Card className="p-4 space-y-3 fade-in">
      <div className="flex items-center justify-between">
        <SectionTitle className="flex-1">{dateLabelJa(date)}</SectionTitle>
        <Button variant="ghost" onClick={() => setAdding(!adding)}>
          {adding ? "閉じる" : "＋ 予定を追加"}
        </Button>
      </div>

      {shifts.length === 0 && events.length === 0 && (
        <p className="text-sm text-muted">この日の予定はありません</p>
      )}

      {shifts.length > 0 && (
        <ul className="space-y-1.5">
          {shifts.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ background: s.staff?.theme_color ?? "#B89B5E" }}
                aria-hidden
              />
              <span className="text-ink">
                {staffLabel(s.staff)}
              </span>
              <span className="text-muted tnum">
                {timeShort(s.start_time)}〜{timeShort(s.end_time)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {events.length > 0 && (
        <ul className="space-y-1.5">
          {events.map((e) => (
            <li key={e.id} className="flex items-center gap-2 text-sm">
              <span
                className={`rounded-full border px-2 py-px text-[11px] ${
                  eventChipClass[EVENT_TYPE_META[e.type].color]
                }`}
              >
                {EVENT_TYPE_META[e.type].label}
              </span>
              <span className="flex-1 text-ink">
                {e.title}
                {e.repeat_weekday !== null && (
                  <span className="ml-1 text-[11px] text-muted">
                    （毎週{WEEKDAYS_JA[e.repeat_weekday]}）
                  </span>
                )}
                {e.store_id !== null && (
                  <span className="ml-1 text-[11px] text-muted">
                    {stores.find((s) => s.id === e.store_id)?.name}
                  </span>
                )}
              </span>
              {(isAdmin || e.created_by === myAuthId) && (
                <Button variant="ghost" disabled={busy} onClick={() => deleteEvent(e)}>
                  削除
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="rounded-xl border border-gold/40 bg-gold-soft/30 p-3 space-y-3 fade-in">
          <TextField
            label="タイトル"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: 燃えるゴミ / 練習モデル 19時〜"
            autoFocus
          />
          <p className="text-xs font-semibold text-muted">種別</p>
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(EVENT_TYPE_META) as EventType[]).map((t) => (
              <Chip
                key={t}
                label={EVENT_TYPE_META[t].label}
                selected={type === t}
                onClick={() => setType(t)}
              />
            ))}
          </div>
          <p className="text-xs font-semibold text-muted">店舗</p>
          <div className="flex gap-2 flex-wrap">
            <Chip label="全店舗" selected={storeId === null} onClick={() => setStoreId(null)} />
            {stores.map((s) => (
              <Chip
                key={s.id}
                label={s.name}
                selected={storeId === s.id}
                onClick={() => setStoreId(s.id)}
              />
            ))}
          </div>
          <Chip
            label={`毎週${WEEKDAYS_JA[jstWeekday]}曜に繰り返す`}
            selected={repeatWeekly}
            onClick={() => setRepeatWeekly(!repeatWeekly)}
          />
          <div>
            <Button disabled={busy || !title.trim()} onClick={addEvent}>
              追加する
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
