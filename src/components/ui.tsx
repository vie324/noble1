"use client";

import { useEffect, useRef, useState } from "react";
import type { FlagColorKey } from "@/lib/types";

/* ---------------- カード ---------------- */
export function Card({
  children,
  className = "",
  hairline = true,
}: {
  children: React.ReactNode;
  className?: string;
  hairline?: boolean;
}) {
  return (
    <div className={`noble-card ${hairline ? "gold-hairline" : ""} ${className}`}>
      {children}
    </div>
  );
}

/* ---------------- セクション見出し（◆オーナメント） ---------------- */
export function SectionTitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`ornament-divider my-2 ${className}`}>
      <span className="text-[8px] leading-none select-none" aria-hidden>
        ◆
      </span>
      <h2 className="serif text-base font-semibold tracking-wide text-ink min-w-0 text-center text-balance">
        {children}
      </h2>
      <span className="text-[8px] leading-none select-none" aria-hidden>
        ◆
      </span>
    </div>
  );
}

/* ---------------- 選択チップ（44px タップターゲット） ---------------- */
export function Chip({
  label,
  selected,
  onClick,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      className={`min-h-11 px-4 rounded-full border text-sm transition-colors duration-150 ${
        selected
          ? "border-gold bg-gold-soft text-gold-dk font-semibold shadow-[inset_0_0_0_1px_var(--noble-gold)]"
          : "border-hairline bg-surface text-ink hover:border-gold"
      } ${disabled ? "opacity-40" : ""}`}
    >
      {selected && (
        <span className="mr-1 text-[9px] align-middle text-gold" aria-hidden>
          ◆
        </span>
      )}
      {label}
    </button>
  );
}

/* ---------------- チップの並び（スマホは1行で横スクロール、PCは折り返し） ---------------- */
export function ChipRow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap md:overflow-visible [&>*]:shrink-0 [&>*]:whitespace-nowrap ${className}`}
    >
      {children}
    </div>
  );
}

/* ---------------- ステータス/フラグバッジ ---------------- */
const badgeStyles: Record<FlagColorKey, string> = {
  caution: "bg-caution-soft text-caution border-caution/30",
  warn: "bg-warn-soft text-warn border-warn/30",
  ok: "bg-ok-soft text-ok border-ok/30",
  rose: "bg-rose-soft text-rose border-rose/40",
  gold: "bg-gold-soft text-gold-dk border-gold/40",
};

export function Badge({
  color,
  icon,
  children,
}: {
  color: FlagColorKey;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${badgeStyles[color]}`}
    >
      {icon}
      {children}
    </span>
  );
}

/* ---------------- KPI カウントアップ ---------------- */
export function CountUp({
  value,
  format = (n) => n.toLocaleString("ja-JP"),
  duration = 700,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    startRef.current = null;
    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const t = Math.min((ts - startRef.current) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className="tnum">{format(display)}</span>;
}

/* ---------------- スケルトン ---------------- */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="読み込み中">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

/* ---------------- 空状態 ---------------- */
export function EmptyState({
  message,
  children,
}: {
  message: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="py-12 text-center text-muted fade-in">
      <div className="text-gold text-xs mb-3" aria-hidden>
        ◆
      </div>
      <p className="text-sm">{message}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/* ---------------- 入力共通 ---------------- */
export function TextField({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-muted mb-1">{label}</span>
      <input
        {...props}
        className={`w-full min-h-11 rounded-lg border border-hairline bg-surface px-3 text-base text-ink outline-none transition-colors focus:border-gold ${props.className ?? ""}`}
      />
    </label>
  );
}

export function TextArea({
  label,
  ...props
}: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-muted mb-1">{label}</span>
      <textarea
        {...props}
        className={`w-full rounded-lg border border-hairline bg-surface px-3 py-2.5 text-base text-ink outline-none transition-colors focus:border-gold ${props.className ?? ""}`}
      />
    </label>
  );
}

/* ---------------- ボタン ---------------- */
export function Button({
  variant = "primary",
  className = "",
  ...props
}: {
  variant?: "primary" | "secondary" | "ghost" | "danger";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = {
    primary:
      "bg-gold text-white hover:bg-gold-dk shadow-[0_2px_8px_rgba(184,155,94,0.35)]",
    secondary:
      "bg-surface text-gold-dk border border-gold hover:bg-gold-soft",
    ghost: "bg-transparent text-muted hover:text-ink hover:bg-gold-soft",
    danger: "bg-caution text-white hover:opacity-90",
  } as const;
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 min-h-11 rounded-full px-5 text-sm font-semibold transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none ${styles[variant]} ${className}`}
    />
  );
}

/* ---------------- 画面下の固定ボタン列（長いフォームの保存ボタン） ----------------
   スマホはボトムナビのすぐ上に固定され、スクロールしなくても保存できる */
export function StickyActions({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`sticky z-20 above-nav md:bottom-4 -mx-4 px-4 py-3 bg-base/95 backdrop-blur border-t border-hairline md:mx-0 md:rounded-2xl md:border md:shadow-[0_4px_20px_rgba(61,53,46,0.08)] print:hidden ${className}`}
    >
      {children}
    </div>
  );
}

/* ---------------- セレクト ---------------- */
export function SelectField({
  label,
  children,
  ...props
}: { label: string; children: React.ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-muted mb-1">{label}</span>
      <select
        {...props}
        className={`w-full min-h-11 rounded-lg border border-hairline bg-surface px-3 text-base text-ink outline-none transition-colors focus:border-gold ${props.className ?? ""}`}
      >
        {children}
      </select>
    </label>
  );
}

/* ---------------- ステップ見出し（月締めなどの手順） ---------------- */
export function StepHeader({
  no,
  title,
  done = false,
  children,
}: {
  no: number;
  title: string;
  done?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={`shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold tnum ${
          done ? "bg-ok text-white" : "bg-gold-soft text-gold-dk border border-gold/50"
        }`}
        aria-hidden
      >
        {done ? "✓" : no}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold text-ink leading-8">{title}</h2>
        {children}
      </div>
    </div>
  );
}
