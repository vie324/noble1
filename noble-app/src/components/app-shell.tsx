"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { createClient } from "@/lib/supabase/client";

/* ナビゲーション定義 */
const navItems = [
  { href: "/", label: "今日", icon: IconSun, exact: true },
  { href: "/visits", label: "カルテ", icon: IconBook, exact: false },
  { href: "/customers", label: "お客様", icon: IconUsers, exact: false },
  { href: "/calendar", label: "予定", icon: IconCalendar, exact: false },
  { href: "/board", label: "掲示板", icon: IconBoard, exact: false },
  { href: "/inventory", label: "在庫", icon: IconBox, exact: false },
];

// 経営 = /admin 配下すべて（マスタ管理は経営サブタブ内）
const adminItems = [
  {
    href: "/admin/dashboard",
    label: "経営",
    icon: IconChart,
    exact: false,
    match: (p: string) => p.startsWith("/admin"),
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { me, isAdmin, stores, storeFilter, setStoreFilter } = useApp();
  const pathname = usePathname();
  const router = useRouter();

  const items = isAdmin ? [...navItems, ...adminItems] : navItems;

  async function handleLogout() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const isActive = (item: {
    href: string;
    exact: boolean;
    match?: (p: string) => boolean;
  }) =>
    item.match
      ? item.match(pathname)
      : item.exact
        ? pathname === item.href
        : pathname.startsWith(item.href);

  return (
    <div className="flex-1 flex flex-col min-h-dvh">
      {/* ヘッダー */}
      <header className="sticky top-0 z-30 bg-base/90 backdrop-blur border-b border-hairline print:hidden">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-center justify-between h-14">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="serif text-2xl tracking-wide text-ink">Noble</span>
              <span className="text-gold text-[8px]" aria-hidden>◆</span>
            </Link>

            {/* PC/iPad横向け ナビ */}
            <nav className="hidden md:flex items-center gap-1">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`min-h-11 inline-flex items-center px-4 rounded-full text-sm transition-colors ${
                    isActive(item)
                      ? "bg-gold-soft text-gold-dk font-semibold"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-sm text-muted">
                {me.icon_emoji} {me.name}
              </span>
              <button
                onClick={handleLogout}
                className="min-h-11 px-3 text-xs text-muted hover:text-ink transition-colors"
              >
                ログアウト
              </button>
            </div>
          </div>

          {/* グローバル店舗フィルタ（全画面共通・ワンタップ切替） */}
          <div className="pb-2 -mx-1 overflow-x-auto">
            <div
              className="flex items-center gap-1 px-1"
              role="radiogroup"
              aria-label="店舗フィルタ"
            >
              <StoreTab
                label="全店舗"
                selected={storeFilter === null}
                onClick={() => setStoreFilter(null)}
              />
              {stores.map((s) => (
                <StoreTab
                  key={s.id}
                  label={s.name}
                  selected={storeFilter === s.id}
                  onClick={() => setStoreFilter(s.id)}
                />
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* メイン */}
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-5 pb-24 md:pb-8">
        {children}
      </main>

      {/* スマホ・iPad縦向け ボトムナビ */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur border-t border-hairline print:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="メインナビゲーション"
      >
        <div className="flex">
          {items.map((item) => {
            const { href, label, icon: Icon } = item;
            const active = isActive(item);
            return (
              <Link
                key={href}
                href={href}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 min-h-14 justify-center text-[11px] transition-colors ${
                  active ? "text-gold-dk font-semibold" : "text-muted"
                }`}
              >
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function StoreTab({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`min-h-9 px-4 rounded-full text-sm whitespace-nowrap transition-colors duration-150 ${
        selected
          ? "bg-ink text-[#FBF8F3] font-semibold"
          : "text-muted hover:text-ink hover:bg-gold-soft"
      }`}
    >
      {label}
    </button>
  );
}

/* ---------------- インラインアイコン ---------------- */
function IconSun({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
    </svg>
  );
}

function IconBook({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4a2 2 0 0 0-2-2H6.5A2.5 2.5 0 0 0 4 4.5v15Z" />
      <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
    </svg>
  );
}

function IconUsers({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16.5 14.5c2.4.2 4.3 1.7 5 4" />
    </svg>
  );
}

function IconCalendar({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M8 3v4m8-4v4M3 10h18" />
    </svg>
  );
}

function IconChart({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M3 3v17a1 1 0 0 0 1 1h17" />
      <path d="M7 14l4-4 3 3 5-6" />
    </svg>
  );
}

function IconBoard({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

function IconBox({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
    </svg>
  );
}

