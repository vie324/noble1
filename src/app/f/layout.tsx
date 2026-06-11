// お客様向け公開フォームの共通レイアウト（認証なし・最小限の枠のみ）
export default function PublicFormLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex-1 px-4 py-8">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-6">
          <p className="text-gold text-[10px] tracking-[0.5em]" aria-hidden>
            ◆ ◆ ◆
          </p>
          <p className="serif text-3xl text-ink mt-1">Noble</p>
        </div>
        {children}
        <p className="text-center text-[11px] text-muted mt-8">
          エステサロン ノーブル
        </p>
      </div>
    </main>
  );
}
