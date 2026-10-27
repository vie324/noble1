"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type Tone = "ok" | "error";
type Notify = (message: string, tone?: Tone) => void;

const ToastContext = createContext<Notify>(() => {});

// 画面下（スマホはボトムナビの上）に数秒だけ出る結果表示
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; message: string; tone: Tone }[]>([]);
  const nextId = useRef(1);

  const notify = useCallback<Notify>((message, tone = "ok") => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-2), { id, message, tone }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), tone === "error" ? 5000 : 3000);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div
        aria-live="polite"
        className="fixed z-[60] inset-x-0 above-nav md:bottom-6 mb-3 flex flex-col items-center gap-2 px-4 pointer-events-none print:hidden"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={`toast-in pointer-events-auto max-w-md rounded-2xl px-4 py-3 text-sm font-semibold shadow-[0_8px_24px_rgba(61,53,46,0.18)] ${
              t.tone === "error" ? "bg-caution text-white" : "bg-ink text-[#FBF8F3]"
            }`}
          >
            {t.tone === "ok" ? "✓ " : ""}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Notify {
  return useContext(ToastContext);
}
