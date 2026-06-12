"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

// 起動時スプラッシュ（セッション中1回だけ・約1秒・reduced-motion時は表示しない）
export function Splash() {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (window.sessionStorage.getItem("noble.splashShown")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.sessionStorage.setItem("noble.splashShown", "1");
      return;
    }
    window.sessionStorage.setItem("noble.splashShown", "1");
    setShow(true);
    const t1 = setTimeout(() => setLeaving(true), 900);
    const t2 = setTimeout(() => setShow(false), 1300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{
        background: "var(--noble-base)",
        opacity: leaving ? 0 : 1,
        transition: "opacity 400ms ease",
      }}
    >
      <div className="text-center fade-in">
        <Image
          src="/logo.png"
          alt=""
          width={180}
          height={170}
          priority
          className="mx-auto"
        />
        <p className="mt-4 text-[10px] tracking-[0.4em] text-muted">NOBLE</p>
      </div>
    </div>
  );
}
