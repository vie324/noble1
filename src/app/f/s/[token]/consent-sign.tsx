"use client";

import { useRef, useState, useTransition } from "react";
import { signConsent } from "../../actions";

// 電子署名（canvas）＋お名前入力 → サーバーアクションで保存
export function ConsentSign({
  token,
  defaultName,
}: {
  token: string;
  defaultName: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [name, setName] = useState(defaultName);
  const [agreed, setAgreed] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.strokeStyle = "#3D352E";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasInk.current = true;
  }

  function clear() {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
  }

  function handleSubmit() {
    setError(null);
    if (!agreed) {
      setError("内容への同意にチェックを入れてください");
      return;
    }
    if (!hasInk.current) {
      setError("枠内にご署名ください");
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
      <div className="noble-card gold-hairline p-6 text-center space-y-2 fade-in">
        <p className="text-gold text-xs" aria-hidden>◆</p>
        <p className="serif text-xl text-ink">ご署名ありがとうございました</p>
        <p className="text-sm text-muted">同意書の受付が完了しました。</p>
      </div>
    );
  }

  return (
    <div className="noble-card gold-hairline p-5 space-y-4">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 w-5 h-5 accent-(--noble-gold)"
        />
        <span className="text-sm text-ink">上記の内容を確認し、同意します</span>
      </label>

      <label className="block">
        <span className="block text-xs font-semibold text-muted mb-1">お名前（自署と同じ）</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full min-h-11 rounded-lg border border-hairline bg-surface px-3 text-base outline-none focus:border-gold"
        />
      </label>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-muted">ご署名（枠内に指やペンでお書きください）</span>
          <button
            type="button"
            onClick={clear}
            className="text-xs text-gold-dk underline underline-offset-2 min-h-9 px-1"
          >
            書き直す
          </button>
        </div>
        <canvas
          ref={canvasRef}
          width={640}
          height={240}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={() => (drawing.current = false)}
          onPointerLeave={() => (drawing.current = false)}
          className="w-full h-40 rounded-xl border-2 border-dashed border-gold/50 bg-surface touch-none"
        />
      </div>

      {error && (
        <p className="text-sm text-caution bg-caution-soft rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={handleSubmit}
        className="w-full min-h-12 rounded-full bg-gold text-white text-sm font-semibold hover:bg-gold-dk transition-colors disabled:opacity-50 shadow-[0_2px_8px_rgba(184,155,94,0.35)]"
      >
        {pending ? "送信中…" : "署名して同意する"}
      </button>
    </div>
  );
}
