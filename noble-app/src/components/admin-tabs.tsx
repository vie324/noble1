"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 経営（管理者専用）エリアのサブナビゲーション
const tabs = [
  { href: "/admin/dashboard", label: "経営サマリー" },
  { href: "/admin/sales", label: "実績入力" },
  { href: "/admin/analytics", label: "売上・媒体" },
  { href: "/admin/menus", label: "メニュー・部位" },
  { href: "/admin/staff-performance", label: "スタッフ実績" },
  { href: "/admin/tickets", label: "回数券残高" },
  { href: "/admin/simulation", label: "シミュレーション" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav className="-mx-4 px-4 overflow-x-auto" aria-label="経営メニュー">
      <div className="flex items-center gap-1 border-b border-hairline pb-2 min-w-max">
        {tabs.map((t) => {
          const active = pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`min-h-10 inline-flex items-center px-3.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                active
                  ? "bg-gold-soft text-gold-dk font-semibold"
                  : "text-muted hover:text-ink"
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

/* 月送りセレクタ（経営系ページ共通） */
export function MonthNav({
  month,
  onChange,
}: {
  month: string; // "YYYY-MM-01"
  onChange: (m: string) => void;
}) {
  const shift = (n: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    onChange(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`);
  };
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => shift(-1)}
        aria-label="前月"
        className="min-h-11 min-w-11 rounded-full text-xl text-muted hover:text-ink hover:bg-gold-soft transition-colors"
      >
        ‹
      </button>
      <input
        type="month"
        value={month.slice(0, 7)}
        onChange={(e) => e.target.value && onChange(`${e.target.value}-01`)}
        className="min-h-11 rounded-lg border border-hairline bg-surface px-2 text-sm text-ink outline-none focus:border-gold"
        aria-label="対象月"
      />
      <button
        type="button"
        onClick={() => shift(1)}
        aria-label="翌月"
        className="min-h-11 min-w-11 rounded-full text-xl text-muted hover:text-ink hover:bg-gold-soft transition-colors"
      >
        ›
      </button>
    </div>
  );
}
