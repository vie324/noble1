"use client";

import { useRef, useState, useTransition } from "react";
import { signConsent } from "../../actions";
import { SignaturePad } from "@/components/consent-step";
import {
  FieldError,
  FieldLabel,
  FORM_INPUT_CLASS,
  FormAlert,
  FormComplete,
  RequiredBadge,
  revealField,
} from "@/components/public-form-ui";

// 電子署名（canvas）＋お名前入力 → サーバーアクションで保存
export function ConsentSign({
  token,
  defaultName,
}: {
  token: string;
  defaultName: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasInk, setHasInk] = useState(false);
  const [name, setName] = useState(defaultName);
  const [agreed, setAgreed] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [pending, startTransition] = useTransition();

  // 送信を試みた後は、足りない項目を入力欄の近くとボタンの上に示す（確認の順番は従来どおり）
  const agreeInvalid = showErrors && !agreed;
  const signInvalid = showErrors && !hasInk;
  const nameInvalid = showErrors && !name.trim();
  const validationMessage = !showErrors
    ? null
    : !agreed
      ? "内容への同意にチェックを入れてください"
      : !hasInk
        ? "枠内にご署名ください"
        : !name.trim()
          ? "お名前を入力してください"
          : null;
  const alertMessage = error ?? validationMessage;

  function handleSubmit() {
    setError(null);
    if (!agreed) {
      setShowErrors(true);
      revealField("consent-agree");
      return;
    }
    if (!hasInk) {
      setShowErrors(true);
      revealField("consent-sign", { focus: false });
      return;
    }
    // お名前はサーバー側でも確認している（同じ条件を送信前に案内するだけ）
    if (!name.trim()) {
      setShowErrors(true);
      revealField("consent-name");
      return;
    }
    const dataUrl = canvasRef.current!.toDataURL("image/png");
    startTransition(async () => {
      const res = await signConsent(token, name, dataUrl);
      if (res.ok) setDone(true);
      else setError(res.message ?? "送信に失敗しました");
    });
  }

  if (done) {
    return (
      <FormComplete title="ご署名ありがとうございました">
        同意書の受付が完了しました。
      </FormComplete>
    );
  }

  return (
    <div className="noble-card gold-hairline space-y-5 p-5">
      <label
        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${
          agreeInvalid
            ? "border-caution bg-caution-soft/40"
            : agreed
              ? "border-gold/60 bg-gold-soft/60"
              : "border-hairline bg-base"
        }`}
      >
        <input
          id="consent-agree"
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          aria-invalid={agreeInvalid || undefined}
          className="mt-0.5 h-6 w-6 shrink-0 accent-(--noble-gold)"
        />
        <span className="text-sm leading-relaxed text-ink">上記の内容を確認し、同意します</span>
      </label>

      <div>
        <FieldLabel htmlFor="consent-name" required>
          お名前（自署と同じ）
        </FieldLabel>
        <input
          id="consent-name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={nameInvalid || undefined}
          className={FORM_INPUT_CLASS}
        />
        {nameInvalid && <FieldError>お名前をご入力ください</FieldError>}
      </div>

      <div id="consent-sign">
        <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-muted">
          ご署名（枠内に指やペンでお書きください）
          <RequiredBadge />
        </p>
        <SignaturePad
          canvasRef={canvasRef}
          width={640}
          height={240}
          className="h-40"
          invalid={signInvalid}
          onInkChange={setHasInk}
        />
        {signInvalid && <FieldError>枠内にご署名ください</FieldError>}
      </div>

      {alertMessage && <FormAlert>{alertMessage}</FormAlert>}

      <button
        type="button"
        disabled={pending}
        onClick={handleSubmit}
        className="w-full min-h-12 rounded-full bg-gold text-sm font-semibold text-white shadow-[0_2px_8px_rgba(184,155,94,0.35)] transition-colors hover:bg-gold-dk disabled:opacity-50"
      >
        {pending ? "送信中…" : "署名して同意する"}
      </button>
    </div>
  );
}
