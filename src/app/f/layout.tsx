import Image from "next/image";

// お客様向け公開フォームの共通レイアウト（認証なし・最小限の枠のみ）
export default function PublicFormLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex-1 px-4 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-6">
          <Image src="/logo.png" alt="ESTHETIC BY NOBLE" width={140} height={132} priority className="mx-auto" />
        </div>
        {children}
        <p className="text-center text-[11px] tracking-wider text-muted mt-10">
          エステサロン ノーブル
        </p>
      </div>
    </main>
  );
}
