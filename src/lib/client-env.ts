"use client";

import { useSyncExternalStore } from "react";

// ブラウザでしか分からない値を、サーバー描画との不一致（hydration エラー）なしで読む
const subscribeNothing = () => () => {};

// 例: "https://noble1.vercel.app"（サーバー描画時は空文字）
export function useOrigin(): string {
  return useSyncExternalStore(
    subscribeNothing,
    () => window.location.origin,
    () => ""
  );
}

export type Platform = "ios" | "android" | "desktop";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    return "ios";
  }
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export function usePlatform(): Platform {
  return useSyncExternalStore(subscribeNothing, detectPlatform, () => "desktop");
}

// Web Share API（スマホの共有シート）が使えるか
export function useCanShare(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => typeof navigator.share === "function",
    () => false
  );
}
