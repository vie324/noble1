// お客様向け公開フォーム（/f/...）の共通パーツ。
// サーバー側のページ（完了・エラー表示）とクライアント側のフォームの両方から使うため "use client" は付けない。

/** 1行の文字入力欄。text-base は文字サイズ（16px）なので、文字色は text-ink で明示する */
export const FORM_INPUT_CLASS =
  "block w-full min-h-12 rounded-xl border border-hairline bg-surface px-3.5 text-base text-ink outline-none transition-colors focus:border-gold aria-[invalid=true]:border-caution";

/** 複数行の文字入力欄 */
export const FORM_TEXTAREA_CLASS =
  "block w-full min-h-28 rounded-xl border border-hairline bg-surface px-3.5 py-3 text-base leading-relaxed text-ink outline-none transition-colors focus:border-gold";

/** チェックマーク（文字の ✓ は端末のフォントで細さや形が変わるため SVG で描く） */
export function CheckIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

/** 「必須」バッジ */
export function RequiredBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-caution-soft px-1.5 text-[10px] font-semibold leading-[18px] text-caution">
      必須
    </span>
  );
}

/** 入力欄の見出し（必須ならバッジ付き） */
export function FieldLabel({
  htmlFor,
  required = false,
  children,
}: {
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-muted"
    >
      {children}
      {required && <RequiredBadge />}
    </label>
  );
}

/** 入力欄のすぐ下に出すエラー */
export function FieldError({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mt-1.5 text-xs font-medium text-caution">
      {children}
    </p>
  );
}

/** 送信ボタンの上に出すエラー（読み上げにも通知） */
export function FormAlert({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="fade-in flex items-start gap-2.5 rounded-xl border border-caution/25 bg-caution-soft px-3.5 py-3 text-sm leading-relaxed text-caution"
    >
      <span
        aria-hidden
        className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-caution text-[11px] font-bold leading-none text-white"
      >
        !
      </span>
      <span>{children}</span>
    </div>
  );
}

/** 送信ボタンの上の案内（残りの必須項目の数） */
export function SubmitHint({ remaining }: { remaining: number }) {
  return (
    <p className="text-center text-xs text-muted" aria-live="polite">
      {remaining > 0 ? (
        <>
          必須項目があと
          <span className="mx-0.5 font-semibold text-ink tnum">{remaining}</span>
          件あります
        </>
      ) : (
        <span className="inline-flex items-center gap-1">
          <CheckIcon className="h-3.5 w-3.5 text-ok" />
          必須項目はすべてご記入いただきました
        </span>
      )}
    </p>
  );
}

/** 手続きの流れ（① ご記入 → ② 同意書・ご署名） */
export function FormSteps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center justify-center gap-2" aria-label="お手続きの流れ">
      {steps.map((label, i) => {
        const no = i + 1;
        const done = no < current;
        const active = no === current;
        return (
          <li key={label} className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
            {i > 0 && <span aria-hidden className="h-px w-5 bg-gold/40" />}
            <span
              aria-hidden
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold tnum ${
                active
                  ? "bg-gold text-white"
                  : done
                    ? "bg-gold-soft text-gold-dk"
                    : "border border-hairline bg-surface text-muted"
              }`}
            >
              {done ? <CheckIcon /> : no}
            </span>
            <span className={`text-xs ${active ? "font-semibold text-ink" : "text-muted"}`}>
              <span className="sr-only">
                ステップ{no}
                {done ? "（完了）" : ""}：
              </span>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** 送信完了・署名済みなどの案内カード */
export function FormComplete({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div role="status" className="noble-card gold-hairline fade-in p-7 text-center">
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gold-soft text-gold-dk">
        <CheckIcon className="h-5 w-5" />
      </span>
      <p className="serif text-xl text-ink">{title}</p>
      {children && (
        <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div>
      )}
      <p className="mt-5 border-t border-hairline pt-4 text-xs text-muted">
        この画面は閉じていただいて問題ありません。
      </p>
    </div>
  );
}

/**
 * 入力が足りない欄までスクロールし、フォーカスも移す（キーボード・読み上げでも位置が分かるように）。
 * id の要素が入力欄・ボタンならそれ自体に、カードなら中の最初の入力欄・ボタンにフォーカスする。
 */
export function revealField(id: string, { focus = true }: { focus?: boolean } = {}) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  if (!focus) return;
  const target = el.matches("input, textarea, select, button")
    ? el
    : el.querySelector<HTMLElement>("input, textarea, select, button");
  target?.focus({ preventScroll: true });
}
