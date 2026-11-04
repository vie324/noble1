"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOrigin } from "@/lib/client-env";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { Button, Card, Chip, ListSkeleton, SectionTitle, TextField } from "@/components/ui";
import { ShiftTabs } from "@/components/shift-tabs";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { compressImage } from "@/lib/image";
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
import type { CalendarEvent, CalendarEventPhoto, EventType, Shift, Staff } from "@/lib/types";

type StaffLite = Pick<Staff, "id" | "name" | "icon_emoji" | "theme_color">;

const PHOTO_BUCKET = "event-photos";
const SETUP_031 =
  "スタッフ・写真を使うには、Supabase の SQL Editor で supabase/migrations/031_calendar_event_staff_photos.sql を実行してください";

// 予定に関係するスタッフの表示（「全スタッフ」または名前の一覧）
function eventStaffNames(e: CalendarEvent, staff: StaffLite[]): string[] {
  if (e.all_staff) return ["全スタッフ"];
  return (e.staff_ids ?? [])
    .map((id) => staff.find((s) => s.id === id))
    .filter((s): s is StaffLite => !!s)
    .map((s) => staffLabel(s));
}

// カレンダーのマスに出す名前（タイトル → スタッフ名 → 種別名の順）
function eventLabel(e: CalendarEvent, staff: StaffLite[]): string {
  return e.title.trim() || eventStaffNames(e, staff).join("・") || EVENT_TYPE_META[e.type].label;
}

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
  const [staff, setStaff] = useState<StaffLite[]>([]);
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

    // 当月の単発予定 ＋ 繰り返し予定（クライアント側で展開）
    const eventRange = `and(date.gte.${month},date.lt.${monthEnd}),repeat_weekday.not.is.null`;
    const [s, e, st] = await Promise.all([
      shiftQ,
      supabase
        .from("calendar_events")
        .select("*, calendar_event_photos (id, event_id, storage_path, created_by)")
        .or(eventRange),
      supabase.from("staff").select("id, name, icon_emoji, theme_color").eq("is_active", true).order("id"),
    ]);
    // 031 未適用（写真テーブルがない）環境では、予定だけを読み込む
    const events = e.error
      ? (await supabase.from("calendar_events").select("*").or(eventRange)).data
      : e.data;
    setShifts((s.data as unknown as Shift[]) ?? []);
    setEvents((events as CalendarEvent[]) ?? []);
    setStaff((st.data as StaffLite[]) ?? []);
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
                staff={staff}
                selected={selectedDate === date}
                onSelect={() => date && setSelectedDate(selectedDate === date ? null : date)}
              />
            ))}
          </div>
          <p className="sm:hidden px-1 pt-2 text-[11px] text-muted">
            丸アイコン＝出勤スタッフ、色の線＝共有予定。日付をタップすると詳細が見られます
          </p>
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
            staff={staff}
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
  const origin = useOrigin();
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

// スマホの月表示で使う、予定の種類ごとの色（細いバー）
const eventBarClass: Record<string, string> = {
  caution: "bg-caution",
  warn: "bg-warn",
  ok: "bg-ok",
  rose: "bg-rose",
  gold: "bg-gold",
};

function DayCell({
  date,
  shifts,
  events,
  staff,
  selected,
  onSelect,
}: {
  date: string | null;
  shifts: Shift[];
  events: CalendarEvent[];
  staff: StaffLite[];
  selected: boolean;
  onSelect: () => void;
}) {
  if (!date) return <div className="min-h-[4.5rem] sm:min-h-24 border-b border-r border-hairline/50" />;
  const isToday = date === todayJST();
  const total = shifts.length + events.length;
  const visible = 4;
  const label = [
    dateLabelJa(date),
    shifts.length > 0 && `出勤${shifts.length}名`,
    events.length > 0 && `予定${events.length}件`,
  ]
    .filter(Boolean)
    .join("・");

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={label}
      aria-pressed={selected}
      className={`min-h-[4.5rem] sm:min-h-24 flex flex-col items-stretch justify-start border-b border-r border-hairline/50 p-0.5 sm:p-1 text-left transition-colors ${
        selected ? "bg-gold-soft/70 ring-2 ring-inset ring-gold" : "hover:bg-gold-soft/30"
      }`}
    >
      <span
        className={`inline-flex items-center justify-center w-6 h-6 text-xs tnum rounded-full ${
          isToday ? "bg-gold text-white font-bold" : "text-ink"
        }`}
      >
        {Number(date.slice(8))}
      </span>

      {/* スマホ: 出勤スタッフのアイコンと予定の色バーだけ（詳細は日付をタップ） */}
      <div className="sm:hidden mt-0.5 space-y-0.5" aria-hidden>
        {shifts.length > 0 && (
          <div className="flex flex-wrap gap-px">
            {shifts.slice(0, 6).map((s) => (
              <span
                key={`s${s.id}`}
                className="w-[18px] h-[18px] rounded-full inline-flex items-center justify-center text-[12px] leading-none overflow-hidden"
                style={{ background: `${s.staff?.theme_color ?? "#B89B5E"}2e` }}
              >
                {s.staff?.icon_emoji || s.staff?.name.slice(0, 1) || "・"}
              </span>
            ))}
            {shifts.length > 6 && (
              <span className="text-[11px] text-muted leading-[18px]">+{shifts.length - 6}</span>
            )}
          </div>
        )}
        {events.slice(0, 3).map((e) => (
          <span
            key={`e${e.id}`}
            className={`block h-1.5 rounded-full ${eventBarClass[EVENT_TYPE_META[e.type].color]}`}
          />
        ))}
      </div>

      {/* PC・タブレット: 「🐨 10-19」をスタッフカラーで */}
      <div className="hidden sm:block space-y-0.5 mt-0.5">
        {shifts.slice(0, visible).map((s) => (
          <div
            key={`s${s.id}`}
            className="truncate rounded px-1 py-px text-[10px] leading-tight border tnum"
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
            className={`truncate rounded px-1 py-px text-[10px] leading-tight border ${
              eventChipClass[EVENT_TYPE_META[e.type].color]
            }`}
          >
            {(e.calendar_event_photos?.length ?? 0) > 0 && <span aria-label="写真あり">📷 </span>}
            {eventLabel(e, staff)}
          </div>
        ))}
        {total > visible && <div className="text-[10px] text-muted pl-1">＋{total - visible}件</div>}
      </div>
    </button>
  );
}


// 選んだ写真は先に圧縮しておく（送信が速くなり、プレビューにも使える）
interface PendingPhoto {
  key: string;
  blob: Blob;
  preview: string;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function preparePhotos(files: FileList | null): Promise<PendingPhoto[]> {
  const list = Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
  return Promise.all(
    list.map(async (f) => {
      const blob = await compressImage(f, { maxEdge: 1600, quality: 0.82 });
      return { key: crypto.randomUUID(), blob, preview: await blobToDataUrl(blob) };
    })
  );
}

function DayDetail({
  date,
  shifts,
  events,
  staff,
  stores,
  isAdmin,
  myAuthId,
  autoOpenAdd = false,
  onChanged,
}: {
  date: string;
  shifts: Shift[];
  events: CalendarEvent[];
  staff: StaffLite[];
  stores: { id: number; name: string }[];
  isAdmin: boolean;
  myAuthId: string | null;
  autoOpenAdd?: boolean;
  onChanged: () => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const notify = useToast();
  const [adding, setAdding] = useState(autoOpenAdd);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<EventType>("todo");
  const [storeId, setStoreId] = useState<number | null>(null);
  const [allStaff, setAllStaff] = useState(false);
  const [staffIds, setStaffIds] = useState<number[]>([]);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadingFor, setUploadingFor] = useState<number | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map());
  const [viewer, setViewer] = useState<{ eventId: number; index: number } | null>(null);

  const jstWeekday = new Date(`${date}T12:00:00+09:00`).getUTCDay();
  const hasStaff = allStaff || staffIds.length > 0;
  const canSubmit = !busy && !preparing && (title.trim() !== "" || hasStaff);

  // この日の予定の写真を署名付きURLでまとめて取得（非公開バケット）
  const pathsKey = events
    .flatMap((e) => (e.calendar_event_photos ?? []).map((p) => p.storage_path))
    .join("|");
  useEffect(() => {
    if (!pathsKey) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrls(pathsKey.split("|"), 60 * 60);
      if (cancelled) return;
      const map = new Map<string, string>();
      data?.forEach((d) => d.path && d.signedUrl && map.set(d.path, d.signedUrl));
      setPhotoUrls(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, pathsKey]);

  function toggleStaff(id: number) {
    setAllStaff(false);
    setStaffIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function pickPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setPreparing(true);
    try {
      const prepared = await preparePhotos(files);
      setPending((list) => [...list, ...prepared]);
    } catch (e) {
      console.error(e);
      notify("写真を読み込めませんでした（JPEG・PNG などの画像を選んでください）", "error");
    } finally {
      setPreparing(false);
    }
  }

  // 写真をアップロードして予定に紐付ける。失敗した枚数を返す
  async function uploadPhotos(eventId: number, blobs: Blob[]): Promise<number> {
    let failed = 0;
    for (const blob of blobs) {
      const path = `${eventId}/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, blob, { contentType: "image/jpeg" });
      if (upErr) {
        console.error(upErr);
        failed++;
        continue;
      }
      const { error: insErr } = await supabase
        .from("calendar_event_photos")
        .insert({ event_id: eventId, storage_path: path });
      if (insErr) {
        console.error(insErr);
        await supabase.storage.from(PHOTO_BUCKET).remove([path]);
        failed++;
      }
    }
    return failed;
  }

  async function addEvent() {
    if (!canSubmit) return;
    setBusy(true);
    const payload: Record<string, unknown> = {
      date,
      type,
      title: title.trim(),
      store_id: storeId,
      repeat_weekday: repeatWeekly ? jstWeekday : null,
    };
    // スタッフ未指定なら列に触れない（031 未適用の環境でも従来どおり登録できる）
    if (hasStaff) {
      payload.all_staff = allStaff;
      payload.staff_ids = allStaff ? [] : staffIds;
    }
    const { data: ev, error } = await supabase
      .from("calendar_events")
      .insert(payload)
      .select("id")
      .single();
    if (error || !ev) {
      setBusy(false);
      notify(
        /staff_ids|all_staff/.test(error?.message ?? "") ? SETUP_031 : `予定を追加できませんでした（${error?.message ?? "不明なエラー"}）`,
        "error"
      );
      return;
    }
    const failed = pending.length > 0 ? await uploadPhotos(ev.id, pending.map((p) => p.blob)) : 0;
    setTitle("");
    setAllStaff(false);
    setStaffIds([]);
    setPending([]);
    setRepeatWeekly(false);
    setAdding(false);
    await onChanged();
    setBusy(false);
    if (failed > 0) notify(`予定は追加しましたが、写真${failed}枚を保存できませんでした。${SETUP_031}`, "error");
    else notify("予定を追加しました");
  }

  async function addPhotosTo(e: CalendarEvent, files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadingFor(e.id);
    try {
      const prepared = await preparePhotos(files);
      const failed = await uploadPhotos(e.id, prepared.map((p) => p.blob));
      await onChanged();
      if (failed > 0) notify(`写真${failed}枚を保存できませんでした。${SETUP_031}`, "error");
      else notify(`写真を${prepared.length}枚追加しました`);
    } catch (err) {
      console.error(err);
      notify("写真を読み込めませんでした", "error");
    } finally {
      setUploadingFor(null);
    }
  }

  async function deleteEvent(e: CalendarEvent) {
    const photos = e.calendar_event_photos ?? [];
    if (
      !window.confirm(
        `「${eventLabel(e, staff)}」を削除しますか？${e.repeat_weekday !== null ? "（繰り返し予定全体が削除されます）" : ""}${
          photos.length > 0 ? `（添付の写真${photos.length}枚も削除されます）` : ""
        }`
      )
    )
      return;
    setBusy(true);
    if (photos.length > 0) {
      await supabase.storage.from(PHOTO_BUCKET).remove(photos.map((p) => p.storage_path));
    }
    const { error } = await supabase.from("calendar_events").delete().eq("id", e.id);
    if (error) notify(`削除できませんでした（${error.message}）`, "error");
    await onChanged();
    setBusy(false);
  }

  async function deletePhoto(photo: CalendarEventPhoto) {
    if (!window.confirm("この写真を削除しますか？")) return;
    await supabase.storage.from(PHOTO_BUCKET).remove([photo.storage_path]);
    const { error } = await supabase.from("calendar_event_photos").delete().eq("id", photo.id);
    if (error) {
      notify(`削除できませんでした（${error.message}）`, "error");
      return;
    }
    setViewer(null);
    await onChanged();
  }

  const viewerEvent = viewer ? events.find((e) => e.id === viewer.eventId) ?? null : null;
  const viewerPhotos = viewerEvent?.calendar_event_photos ?? [];
  const viewerPhoto = viewer ? viewerPhotos[viewer.index] ?? null : null;

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
        <ul className="space-y-2.5">
          {events.map((e) => {
            const names = eventStaffNames(e, staff);
            const photos = e.calendar_event_photos ?? [];
            const inputId = `event-photo-${e.id}`;
            return (
              <li key={e.id} className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <span
                    className={`shrink-0 rounded-full border px-2 py-px text-[11px] ${
                      eventChipClass[EVENT_TYPE_META[e.type].color]
                    }`}
                  >
                    {EVENT_TYPE_META[e.type].label}
                  </span>
                  <span className="flex-1 min-w-0 text-ink">
                    {e.title && <span className="mr-1">{e.title}</span>}
                    {names.map((n) => (
                      <span
                        key={n}
                        className="inline-block mr-1 rounded-full border border-hairline bg-base px-2 py-px text-[12px] text-ink align-middle"
                      >
                        {n}
                      </span>
                    ))}
                    {e.repeat_weekday !== null && (
                      <span className="text-[11px] text-muted">
                        （毎週{WEEKDAYS_JA[e.repeat_weekday]}）
                      </span>
                    )}
                    {e.store_id !== null && (
                      <span className="ml-1 text-[11px] text-muted">
                        {stores.find((s) => s.id === e.store_id)?.name}
                      </span>
                    )}
                  </span>
                  {/* 登録後でも写真を追加できる（全スタッフ） */}
                  <input
                    id={inputId}
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={(ev) => {
                      addPhotosTo(e, ev.target.files);
                      ev.target.value = "";
                    }}
                  />
                  <label
                    htmlFor={inputId}
                    title="写真を追加"
                    className={`shrink-0 min-h-11 inline-flex items-center px-2.5 rounded-full text-xs text-muted hover:text-ink hover:bg-gold-soft cursor-pointer ${
                      uploadingFor === e.id ? "opacity-40 pointer-events-none" : ""
                    }`}
                  >
                    {uploadingFor === e.id ? "保存中…" : "＋写真"}
                  </label>
                  {(isAdmin || e.created_by === myAuthId) && (
                    <Button variant="ghost" disabled={busy} onClick={() => deleteEvent(e)}>
                      削除
                    </Button>
                  )}
                </div>
                {photos.length > 0 && (
                  <div className="flex gap-2 flex-wrap pl-1">
                    {photos.map((p, i) => {
                      const url = photoUrls.get(p.storage_path);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setViewer({ eventId: e.id, index: i })}
                          aria-label={`写真${i + 1}を大きく表示`}
                          className="w-16 h-16 rounded-lg overflow-hidden border border-hairline bg-base hover:border-gold transition-colors"
                        >
                          {url ? (
                            // eslint-disable-next-line @next/next/no-img-element -- 署名付きURLのため next/image 最適化対象外
                            <img src={url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="skeleton block w-full h-full" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {adding && (
        <div className="rounded-xl border border-gold/40 bg-gold-soft/30 p-3 space-y-3 fade-in">
          <TextField
            label={hasStaff ? "タイトル（スタッフを選んだので省略可）" : "タイトル"}
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
          <p className="text-xs font-semibold text-muted">
            スタッフ
            <span className="ml-1.5 font-normal">（この予定に関係する人・複数選択可）</span>
          </p>
          <div className="flex gap-2 flex-wrap">
            <Chip
              label="全スタッフ"
              selected={allStaff}
              onClick={() => {
                setAllStaff(!allStaff);
                setStaffIds([]);
              }}
            />
            {staff.map((s) => (
              <Chip
                key={s.id}
                label={staffLabel(s)}
                selected={!allStaff && staffIds.includes(s.id)}
                onClick={() => toggleStaff(s.id)}
              />
            ))}
          </div>
          <p className="text-xs font-semibold text-muted">
            写真
            <span className="ml-1.5 font-normal">（登録後も、この日の予定からいつでも見られます）</span>
          </p>
          <div className="flex gap-2 flex-wrap">
            {pending.map((p) => (
              <div key={p.key} className="relative w-20 h-20">
                {/* eslint-disable-next-line @next/next/no-img-element -- 端末内のプレビュー画像 */}
                <img src={p.preview} alt="添付する写真" className="w-full h-full object-cover rounded-lg border border-hairline" />
                <button
                  type="button"
                  onClick={() => setPending((list) => list.filter((x) => x.key !== p.key))}
                  aria-label="この写真を外す"
                  className="absolute -top-2 -right-2 min-h-8 min-w-8 rounded-full bg-ink/70 text-white text-xs backdrop-blur"
                >
                  ✕
                </button>
              </div>
            ))}
            <input
              id={`new-event-photo-${date}`}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                pickPhotos(e.target.files);
                e.target.value = "";
              }}
            />
            <label
              htmlFor={`new-event-photo-${date}`}
              className={`w-20 h-20 flex flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-gold/60 bg-surface text-xs text-gold-dk cursor-pointer hover:bg-gold-soft transition-colors ${
                preparing ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              <span className="text-lg leading-none" aria-hidden>
                📷
              </span>
              {preparing ? "読込中…" : "写真を追加"}
            </label>
          </div>
          <Chip
            label={`毎週${WEEKDAYS_JA[jstWeekday]}曜に繰り返す`}
            selected={repeatWeekly}
            onClick={() => setRepeatWeekly(!repeatWeekly)}
          />
          <div>
            <Button disabled={!canSubmit} onClick={addEvent}>
              {busy ? "追加中…" : "追加する"}
            </Button>
            {!title.trim() && !hasStaff && (
              <span className="ml-3 text-xs text-muted">タイトルを入力するか、スタッフを選んでください</span>
            )}
          </div>
        </div>
      )}

      {/* 写真の拡大表示 */}
      <Sheet
        open={viewerPhoto !== null}
        onClose={() => setViewer(null)}
        title={
          viewerEvent
            ? `${eventLabel(viewerEvent, staff)}の写真（${(viewer?.index ?? 0) + 1}/${viewerPhotos.length}）`
            : "写真"
        }
        footer={
          viewerPhoto && viewerEvent ? (
            <div className="flex items-center gap-2 pb-3">
              <Button
                variant="ghost"
                disabled={(viewer?.index ?? 0) === 0}
                onClick={() => viewer && setViewer({ ...viewer, index: viewer.index - 1 })}
              >
                ‹ 前へ
              </Button>
              <Button
                variant="ghost"
                disabled={(viewer?.index ?? 0) >= viewerPhotos.length - 1}
                onClick={() => viewer && setViewer({ ...viewer, index: viewer.index + 1 })}
              >
                次へ ›
              </Button>
              {(isAdmin || viewerPhoto.created_by === myAuthId || viewerEvent.created_by === myAuthId) && (
                <Button variant="ghost" className="ml-auto hover:!text-caution" onClick={() => deletePhoto(viewerPhoto)}>
                  削除
                </Button>
              )}
            </div>
          ) : undefined
        }
      >
        {viewerPhoto && (
          <div className="space-y-2">
            {photoUrls.get(viewerPhoto.storage_path) ? (
              <a href={photoUrls.get(viewerPhoto.storage_path)} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- 署名付きURLのため next/image 最適化対象外 */}
                <img
                  src={photoUrls.get(viewerPhoto.storage_path)}
                  alt="予定の写真"
                  className="w-full max-h-[65dvh] object-contain rounded-xl bg-base"
                />
              </a>
            ) : (
              <div className="skeleton w-full aspect-[4/3]" />
            )}
            <p className="text-[11px] text-muted text-center">写真をタップすると元の大きさで開きます（保存もできます）</p>
          </div>
        )}
      </Sheet>
    </Card>
  );
}
