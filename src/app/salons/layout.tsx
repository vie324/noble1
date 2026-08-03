import Link from "next/link";
import Image from "next/image";

// お客様向け店舗紹介・ご予約ページの共通レイアウト（認証不要）
// LINEリッチメニューの「ご予約」ボタンからLINE内ブラウザで開かれる想定
export default function SalonsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex flex-col">
      <header className="px-5 pt-8 pb-2">
        <Link href="/salons" className="block text-center" aria-label="ESTHETIC BY NOBLE 店舗一覧">
          <Image
            src="/logo.png"
            alt="ESTHETIC BY NOBLE"
            width={120}
            height={113}
            priority
            className="mx-auto"
          />
          <p className="serif text-[11px] tracking-[0.42em] text-muted mt-2 pl-[0.42em]">
            ESTHETIC BY NOBLE
          </p>
        </Link>
      </header>

      <main className="flex-1 px-5 pb-4">
        <div className="max-w-2xl mx-auto">{children}</div>
      </main>

      <footer className="px-5 pb-10 pt-6">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-gold text-[10px] tracking-[0.5em] pl-[0.5em]" aria-hidden>
            ◆ ◆ ◆
          </p>
          <p className="text-[11px] text-muted mt-3 leading-relaxed">
            ハーブピーリング専門店 ノーブル
            <br />
            新宿店 ・ 新宿南口店 ・ 恵比寿店
          </p>
          <p className="text-[11px] text-muted mt-3">
            ※ 施術の効果には個人差があります
          </p>
        </div>
      </footer>
    </div>
  );
}
