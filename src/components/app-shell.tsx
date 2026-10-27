"use client";

import { staffLabel } from "@/lib/format";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { InboxProvider, useInbox } from "@/lib/inbox";
import { createClient } from "@/lib/supabase/client";
import { ADMIN_LINKS } from "@/components/admin-tabs";
import { Sheet } from "@/components/sheet";
import { ToastProvider } from "@/components/toast";
import { EMPLOYMENT_LABEL } from "@/lib/types";

/* ナビゲーション定義
   スマホのボトムナビは毎日使う4つ＋「メニュー」。PC はヘッダーに並べる */
const primaryItems = [
  { href: "/", label: "今日", icon: IconSun, exact: true },
  { href: "/visits", label: "カルテ", icon: IconBook, exact: false },
  { href: "/customers", label: "お客様", icon: IconUsers, exact: false },
  { href: "/calendar", label: "予定", icon: IconCalendar, exact: false },
];

const secondaryItems = [
  { href: "/board", label: "掲示板", icon: IconBoard, exact: false },
  { href: "/inventory", label: "在庫", icon: IconBox, exact: false },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <InboxProvider>
        <ShellFrame>{children}</ShellFrame>
      </InboxProvider>
    </ToastProvider>
  );
}

function ShellFrame({ children }: { children: React.ReactNode }) {
  const { me, isAdmin, stores, storeFilter, setStoreFilter } = useApp();
  const inbox = useInbox();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const headerHidden = useHideOnScroll();

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);
  const menuActive =
    !primaryItems.some((i) => isActive(i.href, i.exact)) && pathname !== "/";
  const badge = inbox.unreadDocuments + (inbox.invoiceState ? 1 : 0);

  const desktopItems = [
    ...primaryItems,
    ...secondaryItems,
    ...(isAdmin
      ? [{ href: "/admin/dashboard", label: "経営", icon: IconChart, exact: false, match: "/admin" }]
      : []),
  ];

  return (
    <div className="flex-1 flex flex-col min-h-dvh">
      {/* ヘッダー（スマホは1行。下にスクロールすると隠れ、上に戻すと出る） */}
      <header
        className={`sticky top-0 z-30 bg-base/95 backdrop-blur border-b border-hairline pt-safe print:hidden transition-transform duration-200 ${
          headerHidden && !menuOpen ? "max-md:-translate-y-full" : ""
        }`}
      >
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-center gap-2 h-14">
            <Link href="/" className="flex items-center gap-2.5 shrink-0" aria-label="Noble ホーム">
              <Image src="/logo.png" alt="" width={34} height={32} priority className="w-[34px] h-auto" />
              <span className="serif text-xl tracking-wide text-ink hidden lg:inline">Noble</span>
            </Link>

            {/* スマホ: 店舗切替をロゴの横に（ワンタップ） */}
            <div className="md:hidden flex-1 min-w-0 overflow-x-auto no-scrollbar">
              <StoreSwitcher
                stores={stores}
                storeFilter={storeFilter}
                onChange={setStoreFilter}
                compact
              />
            </div>

            {/* PC・iPad横向け ナビ */}
            <nav className="hidden md:flex flex-1 items-center gap-1" aria-label="メインナビゲーション">
              {desktopItems.map((item) => {
                const active = "match" in item ? pathname.startsWith(String(item.match)) : isActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`min-h-11 inline-flex items-center px-3.5 lg:px-4 rounded-full text-sm transition-colors ${
                      active ? "bg-gold-soft text-gold-dk font-semibold" : "text-muted hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="hidden md:flex items-center gap-1.5 shrink-0">
              <Link
                href="/help"
                aria-label="使い方ガイド"
                title="使い方ガイド"
                className={`min-h-11 min-w-11 inline-flex items-center justify-center rounded-full transition-colors ${
                  pathname.startsWith("/help")
                    ? "bg-gold-soft text-gold-dk"
                    : "text-muted hover:text-ink hover:bg-gold-soft"
                }`}
              >
                <IconHelp className="w-5 h-5" />
              </Link>
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="relative min-h-11 inline-flex items-center gap-2 pl-3 pr-4 rounded-full border border-hairline bg-surface text-sm text-ink hover:border-gold transition-colors"
                aria-haspopup="dialog"
              >
                <IconMenu className="w-4 h-4 text-muted" />
                <span className="max-w-[10rem] truncate">{staffLabel(me)}</span>
                {badge > 0 && <Dot />}
              </button>
            </div>
          </div>

          {/* PC: グローバル店舗フィルタ（全画面共通・ワンタップ切替） */}
          <div className="hidden md:block pb-2">
            <StoreSwitcher stores={stores} storeFilter={storeFilter} onChange={setStoreFilter} />
          </div>
        </div>
      </header>

      {/* メイン */}
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-5 pb-nav md:pb-10">{children}</main>

      {/* スマホ・iPad縦向け ボトムナビ */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur border-t border-hairline print:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="メインナビゲーション"
      >
        <div className="flex h-16">
          {primaryItems.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] transition-colors ${
                  active ? "text-gold-dk font-semibold" : "text-muted"
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center w-14 h-8 rounded-full transition-colors ${
                    active ? "bg-gold-soft" : ""
                  }`}
                >
                  <Icon className="w-[22px] h-[22px]" />
                </span>
                {label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-haspopup="dialog"
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] transition-colors ${
              menuActive ? "text-gold-dk font-semibold" : "text-muted"
            }`}
          >
            <span
              className={`relative inline-flex items-center justify-center w-14 h-8 rounded-full ${
                menuActive ? "bg-gold-soft" : ""
              }`}
            >
              <IconMenu className="w-[22px] h-[22px]" />
              {badge > 0 && <Dot />}
            </span>
            メニュー
          </button>
        </div>
      </nav>

      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}

/* ---------------- メニュー（スマホはボトムシート、PC はダイアログ） ---------------- */
function MenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, isAdmin } = useApp();
  const inbox = useInbox();
  const pathname = usePathname();
  const router = useRouter();
  const isContractor = me.employment_type === "contractor";

  // 画面を移動したら閉じる
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      onClose();
    }
  }, [pathname, onClose]);

  async function handleLogout() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const invoiceNote = inbox.invoiceMonth
    ? `${Number(inbox.invoiceMonth.slice(5, 7))}月分を${inbox.invoiceState === "create" ? "作成" : "送信"}`
    : null;

  return (
    <Sheet open={open} onClose={onClose} title="メニュー">
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-2xl bg-base border border-hairline px-4 py-3">
          <span
            className="inline-flex items-center justify-center w-11 h-11 rounded-full text-xl shrink-0"
            style={{ background: `${me.theme_color || "#B89B5E"}26` }}
            aria-hidden
          >
            {me.icon_emoji || me.name.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-ink truncate">{me.name}</p>
            <p className="text-xs text-muted">
              {isAdmin ? "管理者" : "スタッフ"}
              {me.employment_type && ` ・ ${EMPLOYMENT_LABEL[me.employment_type]}`}
            </p>
          </div>
        </div>

        {isAdmin && (
          <MenuGroup title="経営（管理者）">
            <div className="grid grid-cols-2 gap-2">
              {ADMIN_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`min-h-12 flex items-center px-3 rounded-xl border text-sm transition-colors ${
                    pathname.startsWith(l.href)
                      ? "border-gold bg-gold-soft text-gold-dk font-semibold"
                      : "border-hairline bg-surface text-ink hover:border-gold"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </MenuGroup>
        )}

        <MenuGroup title="スタッフ">
          <MenuLink href="/my/documents" icon={IconFile} label="マイ書類" note="給与明細・書類の確認" count={inbox.unreadDocuments} />
          {isContractor && (
            <MenuLink
              href="/my/invoices"
              icon={IconReceipt}
              label="請求書"
              note={invoiceNote ?? "業務委託の請求書を作成・送信"}
              count={inbox.invoiceState ? 1 : 0}
            />
          )}
          <MenuLink href="/calendar/my" icon={IconCalendar} label="マイシフト" note="希望の提出・実績の記録" />
          <MenuLink href="/board" icon={IconBoard} label="掲示板" note="お知らせ・マニュアル" />
          <MenuLink href="/inventory" icon={IconBox} label="在庫" note="入庫・棚卸" />
          <MenuLink href="/intake" icon={IconInbox} label="カウンセリング受付" note="LINEから届いた回答" />
          <MenuLink href="/help" icon={IconHelp} label="使い方ガイド" />
        </MenuGroup>


        <button
          type="button"
          onClick={handleLogout}
          className="w-full min-h-12 rounded-xl border border-hairline text-sm text-muted hover:text-caution hover:border-caution/40 transition-colors"
        >
          ログアウト
        </button>
      </div>
    </Sheet>
  );
}

function MenuGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-muted tracking-wide">{title}</h3>
      {children}
    </section>
  );
}

function MenuLink({
  href,
  icon: Icon,
  label,
  note,
  count = 0,
}: {
  href: string;
  icon: (p: { className?: string }) => React.ReactNode;
  label: string;
  note?: string;
  count?: number;
}) {
  const pathname = usePathname();
  const active = pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 min-h-14 px-3 rounded-xl transition-colors ${
        active ? "bg-gold-soft" : "hover:bg-gold-soft/50"
      }`}
    >
      <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-base border border-hairline text-gold-dk shrink-0">
        <Icon className="w-5 h-5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block text-sm ${active ? "font-semibold text-gold-dk" : "text-ink"}`}>{label}</span>
        {note && <span className="block text-xs text-muted truncate">{note}</span>}
      </span>
      {count > 0 && (
        <span className="min-w-6 h-6 px-1.5 inline-flex items-center justify-center rounded-full bg-caution text-white text-xs font-bold tnum">
          {count}
        </span>
      )}
      <span className="text-muted" aria-hidden>
        ›
      </span>
    </Link>
  );
}

function Dot() {
  return (
    <span
      className="absolute top-0.5 right-2.5 w-2.5 h-2.5 rounded-full bg-caution ring-2 ring-surface"
      aria-label="お知らせあり"
    />
  );
}

/* 店舗切替（全画面共通・ワンタップ） */
function StoreSwitcher({
  stores,
  storeFilter,
  onChange,
  compact = false,
}: {
  stores: { id: number; name: string }[];
  storeFilter: number | null;
  onChange: (id: number | null) => void;
  compact?: boolean;
}) {
  const options = [{ id: null as number | null, name: "全店舗" }, ...stores];
  return (
    <div className="flex items-center gap-1 min-w-max" role="radiogroup" aria-label="店舗の切替">
      {options.map((s) => {
        const selected = storeFilter === s.id;
        return (
          <button
            key={s.id ?? "all"}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(s.id)}
            className={`rounded-full whitespace-nowrap transition-colors duration-150 ${
              compact ? "min-h-9 px-3 text-[13px]" : "min-h-9 px-4 text-sm"
            } ${
              selected
                ? "bg-ink text-[#FBF8F3] font-semibold"
                : "text-muted hover:text-ink hover:bg-gold-soft"
            }`}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}

// スマホで下にスクロールしたらヘッダーを隠す（上に戻すと表示）
function useHideOnScroll(): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY;
        if (y < 80) setHidden(false);
        else if (delta > 10) setHidden(true);
        else if (delta < -10) setHidden(false);
        if (Math.abs(delta) > 10 || y < 80) lastY = y;
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return hidden;
}

/* ---------------- インラインアイコン ---------------- */
type IconProps = { className?: string };

function Svg({ className = "", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

function IconSun(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
    </Svg>
  );
}

function IconBook(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4a2 2 0 0 0-2-2H6.5A2.5 2.5 0 0 0 4 4.5v15Z" />
      <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
    </Svg>
  );
}

function IconUsers(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16.5 14.5c2.4.2 4.3 1.7 5 4" />
    </Svg>
  );
}

function IconCalendar(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M8 3v4m8-4v4M3 10h18" />
    </Svg>
  );
}

function IconChart(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 3v17a1 1 0 0 0 1 1h17" />
      <path d="M7 14l4-4 3 3 5-6" />
    </Svg>
  );
}

function IconHelp(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.2 9.3a2.8 2.8 0 0 1 5.4 1c0 1.9-2.8 2.5-2.8 2.5" />
      <path d="M12 17h.01" />
    </Svg>
  );
}

function IconBoard(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </Svg>
  );
}

function IconBox(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
    </Svg>
  );
}

function IconMenu(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

function IconFile(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </Svg>
  );
}

function IconReceipt(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </Svg>
  );
}

function IconInbox(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 13h5l1.5 3h5L16 13h5" />
      <path d="M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5l2.5-8Z" />
    </Svg>
  );
}
