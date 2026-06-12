import Image from "next/image";

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
          <Image src="/logo.png" alt="ESTHETIC BY NOBLE" width={140} height={132} priority className="mx-auto" />
        </div>
        {children}
        <p className="text-center text-[11px] text-muted mt-8">
          エステサロン ノーブル
        </p>
      </div>
    </main>
  );
}
