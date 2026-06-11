"use client";

import { Badge } from "@/components/ui";
import { daysUntil } from "@/lib/format";
import type { CustomerFlag, CustomerTicket } from "@/lib/types";

/* 有効な（未解決の）フラグのみバッジ表示 */
export function FlagBadges({ flags }: { flags: CustomerFlag[] }) {
  const active = flags.filter((f) => !f.resolved_at && f.flag_types);
  if (active.length === 0) return null;
  return (
    <>
      {active.map((f) => (
        <Badge key={f.id} color={f.flag_types!.color_key} icon={<IconAlert />}>
          {f.flag_types!.name}
        </Badge>
      ))}
    </>
  );
}

/* 回数券アラート: 期限30日以内／残り1回 */
export function TicketAlertBadges({ tickets }: { tickets: CustomerTicket[] }) {
  const alerts: React.ReactNode[] = [];
  for (const t of tickets) {
    if (t.remaining_count <= 0) continue;
    const days = daysUntil(t.expires_at);
    if (days < 0) continue;
    if (days <= 30) {
      alerts.push(
        <Badge key={`exp-${t.id}`} color="warn" icon={<IconClock />}>
          期限あと{days}日
        </Badge>
      );
    }
    if (t.remaining_count === 1) {
      alerts.push(
        <Badge key={`last-${t.id}`} color="rose" icon={<IconTicketSmall />}>
          残り1回
        </Badge>
      );
    }
  }
  if (alerts.length === 0) return null;
  return <>{alerts}</>;
}

export function IconAlert() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-3 h-3">
      <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}

export function IconClock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-3 h-3">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function IconTicketSmall() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-3 h-3">
      <path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a3 3 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a3 3 0 0 0 0-6Z" />
    </svg>
  );
}
