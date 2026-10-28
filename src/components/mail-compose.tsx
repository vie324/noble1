"use client";

import { useState } from "react";
import { usePlatform } from "@/lib/client-env";
import { gmailIosAppUrl, gmailWebUrl, mailtoUrl, type MailDraft } from "@/lib/mail";

const btn =
  "inline-flex items-center justify-center gap-1.5 min-h-11 rounded-full px-5 text-sm font-semibold transition-all duration-150";
const primary = `${btn} bg-gold text-white hover:bg-gold-dk shadow-[0_2px_8px_rgba(184,155,94,0.35)]`;
const secondary = `${btn} bg-surface text-gold-dk border border-gold hover:bg-gold-soft`;
const ghost = `${btn} bg-transparent text-muted hover:text-ink hover:bg-gold-soft`;

// 宛先・件名・本文を入れた状態でメール作成画面を開くボタン群
//   iPhone: Gmail アプリ → 標準メール、Android: メールアプリ（通常 Gmail）、PC: ブラウザの Gmail
export function MailComposeButtons({
  draft,
  onOpened,
  label = "Gmailで作成",
}: {
  draft: MailDraft;
  onOpened?: () => void;
  label?: string;
}) {
  const platform = usePlatform();
  const [copied, setCopied] = useState(false);

  async function copyBody() {
    try {
      await navigator.clipboard.writeText(`件名: ${draft.subject}\n\n${draft.body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("本文をコピーしてください", draft.body);
    }
  }

  const disabled = !draft.to;
  const off = disabled ? " opacity-40 pointer-events-none" : "";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {platform === "ios" ? (
          <>
            <a href={disabled ? undefined : gmailIosAppUrl(draft)} onClick={onOpened} className={primary + off} aria-disabled={disabled}>
              {label}
            </a>
            <a href={disabled ? undefined : mailtoUrl(draft)} onClick={onOpened} className={secondary + off} aria-disabled={disabled}>
              メールアプリで作成
            </a>
          </>
        ) : platform === "android" ? (
          <>
            <a href={disabled ? undefined : mailtoUrl(draft)} onClick={onOpened} className={primary + off} aria-disabled={disabled}>
              {label}
            </a>
            <a
              href={disabled ? undefined : gmailWebUrl(draft)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onOpened}
              className={secondary + off}
              aria-disabled={disabled}
            >
              ブラウザのGmailで作成
            </a>
          </>
        ) : (
          <>
            <a
              href={disabled ? undefined : gmailWebUrl(draft)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onOpened}
              className={primary + off}
              aria-disabled={disabled}
            >
              {label}
            </a>
            <a href={disabled ? undefined : mailtoUrl(draft)} onClick={onOpened} className={secondary + off} aria-disabled={disabled}>
              メールアプリで作成
            </a>
          </>
        )}
        <button type="button" onClick={copyBody} className={ghost}>
          {copied ? "✓ コピーしました" : "本文をコピー"}
        </button>
      </div>
      {disabled ? (
        <p className="text-xs text-warn">送付先のメールアドレスが未設定です</p>
      ) : (
        platform === "ios" && (
          <p className="text-[11px] text-muted">
            Gmailアプリが開かないときは「メールアプリで作成」を使ってください
          </p>
        )
      )}
    </div>
  );
}
