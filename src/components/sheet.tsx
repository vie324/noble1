"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const subscribeNothing = () => () => {};

// クライアントでの描画かどうか（ポータルはブラウザでのみ使える）
function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false
  );
}

// ボトムシート（スマホ）／ダイアログ（PC）
//   ・背景タップ・Esc・×で閉じる。開いている間は背面のスクロールを止める
//   ・footer は下端に固定（送信ボタンなど。iPhone のホームバーを避ける）
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const isClient = useIsClient();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // 毎回の描画で onClose が変わっても、開閉以外ではフォーカスを動かさない
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      previous?.focus?.({ preventScroll: true });
    };
  }, [open]);

  // 入力 → 確認 のように中身が切り替わったら、先頭から見せる
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [title]);

  if (!open || !isClient) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-6 print:hidden">
      <div
        className="absolute inset-0 bg-ink/40 sheet-backdrop"
        onClick={() => onCloseRef.current()}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full md:max-w-xl max-h-[92dvh] md:max-h-[85dvh] flex flex-col bg-surface rounded-t-[22px] md:rounded-[18px] shadow-[0_-8px_40px_rgba(61,53,46,0.18)] sheet-panel outline-none"
      >
        <div className="md:hidden mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-hairline" aria-hidden />
        <div className="flex items-center justify-between gap-2 pl-5 pr-2 pt-2 md:pt-3 pb-2 border-b border-hairline shrink-0">
          <h2 id={titleId} className="serif text-lg font-semibold text-ink truncate">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            aria-label="閉じる"
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full text-2xl leading-none text-muted hover:text-ink hover:bg-gold-soft transition-colors"
          >
            ×
          </button>
        </div>
        <div ref={bodyRef} className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-hairline bg-surface px-5 pt-3 pb-safe rounded-b-none md:rounded-b-[18px]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
