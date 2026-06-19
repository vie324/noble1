import { createAdminClient } from "@/lib/supabase/admin";
import { EVENT_TYPE_META, type EventType } from "@/lib/types";

export const dynamic = "force-dynamic";

// Googleカレンダー等から「URLで購読」するための iCal(.ics) フィード。
// 認証は URL のシークレット（?key=...）。ICAL_FEED_SECRET 未設定時は無効。
//   購読URL: https://<本番ドメイン>/api/ics?key=<ICAL_FEED_SECRET>

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// JSTの日付(YYYY-MM-DD)＋時刻(HH:MM[:SS]) → UTCのICSタイムスタンプ
function toUtcStamp(dateStr: string, timeStr: string): string {
  const d = new Date(`${dateStr}T${timeStr.slice(0, 8).padEnd(8, ":00").slice(0, 8)}+09:00`);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function dateOnly(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

function escapeICS(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

export async function GET(request: Request) {
  const secret = process.env.ICAL_FEED_SECRET;
  const key = new URL(request.url).searchParams.get("key");
  if (!secret || key !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Noble//Salon//JA",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Noble シフト・予定",
    "X-WR-TIMEZONE:Asia/Tokyo",
  ];
  const stamp = toUtcStamp(new Date().toISOString().slice(0, 10), "00:00:00");

  try {
    const supabase = createAdminClient();
    const [{ data: shifts }, { data: events }, { data: staff }, { data: stores }] =
      await Promise.all([
        supabase
          .from("shifts")
          .select("id, date, start_time, end_time, staff_id, store_id")
          .eq("status", "confirmed"),
        supabase.from("calendar_events").select("*"),
        supabase.from("staff").select("id, name"),
        supabase.from("stores").select("id, name"),
      ]);

    const staffName = new Map((staff ?? []).map((s) => [s.id, s.name]));
    const storeName = new Map((stores ?? []).map((s) => [s.id, s.name]));

    for (const s of shifts ?? []) {
      const who = staffName.get(s.staff_id) ?? "スタッフ";
      const where = storeName.get(s.store_id) ?? "";
      lines.push(
        "BEGIN:VEVENT",
        `UID:shift-${s.id}@noble`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${toUtcStamp(s.date, s.start_time)}`,
        `DTEND:${toUtcStamp(s.date, s.end_time)}`,
        `SUMMARY:${escapeICS(`${who}（シフト）`)}`,
        `LOCATION:${escapeICS(where)}`,
        "END:VEVENT"
      );
    }

    for (const e of events ?? []) {
      const meta = EVENT_TYPE_META[e.type as EventType];
      const where = e.store_id ? storeName.get(e.store_id) ?? "" : "";
      const summary = `${e.title}${meta ? `（${meta.label}）` : ""}`;
      const base = [
        "BEGIN:VEVENT",
        `UID:event-${e.id}@noble`,
        `DTSTAMP:${stamp}`,
        `SUMMARY:${escapeICS(summary)}`,
        `LOCATION:${escapeICS(where)}`,
      ];
      if (e.repeat_weekday !== null && e.repeat_weekday !== undefined) {
        // 毎週繰り返し（終日）
        base.push(
          `DTSTART;VALUE=DATE:${dateOnly(e.date)}`,
          `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[e.repeat_weekday]}${
            e.repeat_until ? `;UNTIL=${dateOnly(e.repeat_until)}` : ""
          }`
        );
      } else {
        // 単発（終日）
        base.push(`DTSTART;VALUE=DATE:${dateOnly(e.date)}`);
      }
      base.push("END:VEVENT");
      lines.push(...base);
    }
  } catch (e) {
    console.error(e);
  }

  lines.push("END:VCALENDAR");
  const body = lines.join("\r\n");

  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "public, max-age=900",
    },
  });
}
