"use client";

import { useRef, useState } from "react";
import { MENU_CONSENT_TAGS, type ConsentTemplate } from "@/lib/types";
import type { ConsentSignature } from "@/app/f/actions";

// 回答（希望メニュー）から、署名が必要な同意書テンプレートを抽出
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
  return templates.filter((t) => t.menu_tag && tags.has(t.menu_tag));
}

// 署名パッド（canvas）。getDataUrl() で PNG dataURL を取得
function SignaturePad({ onInk }: { onInk: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    };
  }
  return (
    <canvas
      ref={ref}
      width={640}
      height={220}
      data-sig
      onPointerDown={(e) => {
        drawing.current = true;
        const ctx = ref.current!.getContext("2d")!;
        const { x, y } = pos(e);
        ctx.beginPath();
        ctx.moveTo(x, y);
      }}
      onPointerMove={(e) => {
        if (!drawing.current) return;
        e.preventDefault();
        const ctx = ref.current!.getContext("2d")!;
        ctx.strokeStyle = "#3D352E";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const { x, y } = pos(e);
        ctx.lineTo(x, y);
        ctx.stroke();
        onInk();
      }}
      onPointerUp={() => (drawing.current = false)}
      onPointerLeave={() => (drawing.current = false)}
      className="w-full h-36 rounded-xl border-2 border-dashed border-gold/50 bg-surface touch-none"
    />
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
  const inked = useRef<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError("お名前を入力してください");
      return;
    }
    if (!agreed) {
      setError("内容への同意にチェックを入れてください");
      return;
    }
    const consents: ConsentSignature[] = [];
    const canvases = document.querySelectorAll<HTMLCanvasElement>("canvas[data-sig]");
    for (let i = 0; i < templates.length; i++) {
      const t = templates[i];
      if (!inked.current[t.id]) {
        setError(`「${t.title}」にご署名ください`);
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
        <p className="serif text-xl text-ink">施術同意書</p>
        <p className="text-sm text-muted mt-1">
          内容をご確認のうえ、ご署名をお願いいたします
        </p>
      </div>

      <label className="block noble-card gold-hairline p-4">
        <span className="block text-xs font-semibold text-muted mb-1">お名前（自署と同じ）</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full min-h-11 rounded-lg border border-hairline bg-surface px-3 text-base outline-none focus:border-gold"
        />
      </label>

      {templates.map((t) => (
        <div key={t.id} className="noble-card gold-hairline p-4 space-y-3">
          <p className="serif text-base text-ink">{t.title}</p>
          <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed rounded-lg bg-base border border-hairline p-3 max-h-56 overflow-y-auto">
            {t.body}
          </p>
          <p className="text-xs font-semibold text-muted">ご署名（枠内に指やペンで）</p>
          <SignaturePad onInk={() => (inked.current[t.id] = true)} />
        </div>
      ))}

      <label className="flex items-start gap-3 cursor-pointer noble-card gold-hairline p-4">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 w-5 h-5 accent-(--noble-gold)"
        />
        <span className="text-sm text-ink">上記すべての内容を確認し、同意します</span>
      </label>

      {error && (
        <p className="text-sm text-caution bg-caution-soft rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={pending}
          className="min-h-12 px-5 rounded-full border border-hairline text-sm text-muted disabled:opacity-50"
        >
          戻る
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={handleSubmit}
          className="flex-1 min-h-12 rounded-full bg-gold text-white text-sm font-semibold hover:bg-gold-dk transition-colors disabled:opacity-50 shadow-[0_2px_8px_rgba(184,155,94,0.35)]"
        >
          {pending ? "送信中…" : "署名して送信する"}
        </button>
      </div>
    </div>
  );
}
