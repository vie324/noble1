"use client";

import { useRef, useState } from "react";
import { MENU_CONSENT_TAGS, type ConsentTemplate } from "@/lib/types";
import type { ConsentSignature } from "@/app/f/actions";
import {
  FieldError,
  FieldLabel,
  FORM_INPUT_CLASS,
  FormAlert,
  RequiredBadge,
  revealField,
} from "@/components/public-form-ui";

// 回答（希望メニュー）から、署名が必要な同意書テンプレートを抽出
//   menu_tag='all' は希望メニューに関わらず常に提示（統合同意書）
export function matchedConsentTemplates(
  answers: Record<string, string>,
  templates: ConsentTemplate[]
): ConsentTemplate[] {
  const tags = new Set<string>();
  for (const v of Object.values(answers)) {
    for (const opt of String(v).split(",")) {
      const tag = MENU_CONSENT_TAGS[opt.trim()];
      if (tag) tags.add(tag);
    }
  }
  return templates.filter(
    (t) => t.menu_tag === "all" || (!!t.menu_tag && tags.has(t.menu_tag))
  );
}

// 署名パッド（canvas）。枠内の案内文は画面表示だけで、保存される署名画像には入らない
//   canvasRef を渡すと呼び出し側で toDataURL() できる（渡さない場合は canvas[data-sig] で取得）
export function SignaturePad({
  canvasRef,
  width,
  height,
  className = "h-36",
  invalid = false,
  onInkChange,
}: {
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  width: number;
  height: number;
  className?: string;
  invalid?: boolean;
  onInkChange: (hasInk: boolean) => void;
}) {
  const ownRef = useRef<HTMLCanvasElement>(null);
  const ref = canvasRef ?? ownRef;
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    // 指やペンが枠から少しはみ出しても線が途切れないように、ポインターを捕まえておく
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const ctx = e.currentTarget.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = e.currentTarget.getContext("2d")!;
    ctx.strokeStyle = "#3D352E";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk) {
      setHasInk(true);
      onInkChange(true);
    }
  }

  function end() {
    drawing.current = false;
  }

  function clear() {
    const c = ref.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
    onInkChange(false);
  }

  return (
    <div>
      <div className="relative">
        <canvas
          ref={ref}
          width={width}
          height={height}
          data-sig
          aria-label="ご署名欄"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
          className={`block w-full ${className} touch-none rounded-xl border-2 border-dashed bg-surface transition-colors ${
            invalid ? "border-caution/60" : "border-gold/50"
          }`}
        />
        {!hasInk && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted/70"
          >
            こちらにご署名ください
          </span>
        )}
      </div>
      <div className="mt-1 flex justify-end">
        <button
          type="button"
          onClick={clear}
          disabled={!hasInk}
          className="min-h-9 px-2 text-xs font-medium text-gold-dk underline underline-offset-2 disabled:text-muted/60 disabled:no-underline"
        >
          書き直す
        </button>
      </div>
    </div>
  );
}

// 同意書の本文。長い本文は途中まで表示し、「全文を表示する」で広げる（枠内スクロールにしない）
function ConsentBody({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const collapsible = text.length > 240;
  const collapsed = collapsible && !open;

  return (
    <div>
      <div
        className={`relative overflow-hidden rounded-lg border border-hairline bg-base ${
          collapsed ? "max-h-60" : ""
        }`}
      >
        <p className="whitespace-pre-wrap p-3.5 text-sm leading-relaxed text-ink">{text}</p>
        {collapsed && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-base to-transparent"
          />
        )}
      </div>
      {collapsible && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-2 w-full min-h-11 rounded-full border border-hairline bg-surface text-sm font-medium text-gold-dk transition-colors hover:border-gold"
        >
          {open ? "折りたたむ" : "全文を表示する"}
        </button>
      )}
    </div>
  );
}

// カウンセリング送信後の同意書署名ステップ（複数メニュー分まとめて署名）
export function ConsentStep({
  templates,
  defaultName,
  pending,
  onBack,
  onComplete,
}: {
  templates: ConsentTemplate[];
  defaultName: string;
  pending: boolean;
  onBack: () => void;
  onComplete: (consents: ConsentSignature[]) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [agreed, setAgreed] = useState(false);
  const [inked, setInked] = useState<Record<number, boolean>>({});
  const [showErrors, setShowErrors] = useState(false);

  // 送信を試みた後は、足りない項目を入力欄の近くとボタンの上に示す（確認の順番は従来どおり）
  const unsigned = templates.find((t) => !inked[t.id]);
  const nameInvalid = showErrors && !name.trim();
  const agreeInvalid = showErrors && !agreed;
  const message = !showErrors
    ? null
    : !name.trim()
      ? "お名前を入力してください"
      : !agreed
        ? "内容への同意にチェックを入れてください"
        : unsigned
          ? `「${unsigned.title}」にご署名ください`
          : null;

  function handleSubmit() {
    if (!name.trim()) {
      setShowErrors(true);
      revealField("consent-name");
      return;
    }
    if (!agreed) {
      setShowErrors(true);
      revealField("consent-agree");
      return;
    }
    const consents: ConsentSignature[] = [];
    const canvases = document.querySelectorAll<HTMLCanvasElement>("canvas[data-sig]");
    for (let i = 0; i < templates.length; i++) {
      const t = templates[i];
      if (!inked[t.id]) {
        setShowErrors(true);
        revealField(`consent-sign-${t.id}`, { focus: false });
        return;
      }
      consents.push({
        templateId: t.id,
        signerName: name.trim(),
        signatureDataUrl: canvases[i].toDataURL("image/png"),
      });
    }
    onComplete(consents);
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="serif text-xl text-ink">施術同意書</h2>
        <p className="mt-1 text-sm text-muted">
          内容をご確認のうえ、ご署名をお願いいたします
        </p>
      </div>

      <div className="noble-card gold-hairline p-4">
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

      {templates.map((t) => {
        const signInvalid = showErrors && !inked[t.id];
        return (
          <div
            key={t.id}
            data-state={signInvalid ? "invalid" : undefined}
            className="noble-card gold-hairline space-y-4 p-4 transition-[border-color,box-shadow] duration-150"
          >
            <h3 className="serif text-lg text-ink">{t.title}</h3>
            <ConsentBody text={t.body} />
            <div id={`consent-sign-${t.id}`}>
              <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-muted">
                ご署名（枠内に指やペンで）
                <RequiredBadge />
              </p>
              <SignaturePad
                width={640}
                height={220}
                className="h-36"
                invalid={signInvalid}
                onInkChange={(v) => setInked((m) => ({ ...m, [t.id]: v }))}
              />
              {signInvalid && <FieldError>枠内にご署名ください</FieldError>}
            </div>
          </div>
        );
      })}

      <label
        data-state={agreeInvalid ? "invalid" : agreed ? "done" : undefined}
        className="noble-card gold-hairline flex cursor-pointer items-start gap-3 p-4 transition-[border-color,box-shadow] duration-150"
      >
        <input
          id="consent-agree"
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          aria-invalid={agreeInvalid || undefined}
          className="mt-0.5 h-6 w-6 shrink-0 accent-(--noble-gold)"
        />
        <span className="text-sm leading-relaxed text-ink">上記すべての内容を確認し、同意します</span>
      </label>

      {message && <FormAlert>{message}</FormAlert>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={pending}
          className="min-h-12 rounded-full border border-hairline bg-surface px-5 text-sm text-muted transition-colors hover:border-gold/60 disabled:opacity-50"
        >
          戻る
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={handleSubmit}
          className="min-h-12 flex-1 rounded-full bg-gold text-sm font-semibold text-white shadow-[0_2px_8px_rgba(184,155,94,0.35)] transition-colors hover:bg-gold-dk disabled:opacity-50"
        >
          {pending ? "送信中…" : "署名して送信する"}
        </button>
      </div>
    </div>
  );
}
