"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/lib/app-context";

// 予定（シフト・カレンダー）エリアのサブナビゲーション
export function ShiftTabs() {
  const pathname = usePathname();
  const { isAdmin } = useApp();

  const tabs = [
    { href: "/calendar", label: "月間カレンダー", exact: true },
    { href: "/calendar/my", label: "マイシフト", exact: false },
    ...(isAdmin ? [{ href: "/calendar/manage", label: "シフト管理", exact: false }] : []),
  ];

  return (
    <nav className="-mx-4 px-4 overflow-x-auto" aria-label="予定メニュー">
      <div className="flex items-center gap-1 border-b border-hairline pb-2 min-w-max">
        {tabs.map((t) => {
          const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`min-h-10 inline-flex items-center px-3.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                active ? "bg-gold-soft text-gold-dk font-semibold" : "text-muted hover:text-ink"
              }`}
            >
              {active && (
                <span className="mr-1 text-[8px] text-gold" aria-hidden>
                  ◆
                </span>
              )}
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
