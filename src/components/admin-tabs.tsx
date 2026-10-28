"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// 経営（管理者専用）エリアのメニュー。サブナビとスマホの「メニュー」シートで共通
export const ADMIN_LINKS = [
  { href: "/admin/dashboard", label: "経営サマリー" },
  { href: "/admin/payroll", label: "月締め・給与" },
  { href: "/admin/staff-docs", label: "スタッフ書類" },
  { href: "/admin/targets", label: "目標設定" },
  { href: "/admin/sales", label: "実績入力" },
  { href: "/admin/analytics", label: "売上・媒体" },
  { href: "/admin/menus", label: "メニュー・部位" },
  { href: "/admin/staff-performance", label: "スタッフ実績" },
  { href: "/admin/tickets", label: "回数券残高" },
  { href: "/admin/simulation", label: "シミュレーション" },
  { href: "/admin/masters", label: "マスタ管理" },
  { href: "/admin/stores", label: "店舗紹介ページ" },
  { href: "/admin/line", label: "LINE連携" },
] as const;

export function AdminTabs() {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);

  // 選択中のタブが画面外（横スクロールの先）にあるときは見える位置まで寄せる
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  return (
    <nav className="-mx-4 px-4 overflow-x-auto no-scrollbar print:hidden" aria-label="経営メニュー">
      <div className="flex items-center gap-1 border-b border-hairline pb-2 min-w-max">
        {ADMIN_LINKS.map((t) => {
          const active = pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              ref={active ? activeRef : undefined}
              href={t.href}
              aria-current={active ? "page" : undefined}
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
