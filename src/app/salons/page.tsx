import Link from "next/link";
import type { Metadata } from "next";
import { COMMON_NOTES, SALONS } from "@/lib/salons";

export const metadata: Metadata = {
  title: "店舗一覧・ご予約 | ハーブピーリング専門店 ノーブル",
  description:
    "ハーブピーリング専門店ノーブルの店舗一覧（新宿店・新宿南口店・恵比寿店）。アクセス・営業時間・地図をご確認のうえ、ご希望の店舗からネット予約いただけます。",
};

// LINEリッチメニュー「ご予約」ボタンの遷移先（固定URL・認証不要）
export default function SalonsPage() {
  return (
    <div className="space-y-6 fade-in">
      <div className="text-center">
        <h1 className="serif text-3xl text-ink tracking-wide">店舗一覧・ご予約</h1>
        <p className="text-sm text-muted mt-2 leading-relaxed">
          ハーブピーリング専門店ノーブルは都内3店舗。
          <br />
          ご希望の店舗を選んでご予約ください。
        </p>
      </div>

      <ul className="space-y-5 stagger">
        {SALONS.map((salon) => (
          <li key={salon.code} className="noble-card gold-hairline p-5">
            <div className="text-center">
              <h2 className="serif text-2xl text-ink tracking-wide">{salon.name}</h2>
              <p className="serif text-[10px] tracking-[0.35em] text-gold-dk mt-1 pl-[0.35em]">
                {salon.nameEn}
              </p>
              <p className="text-sm text-ink mt-3 leading-relaxed">{salon.catch}</p>
            </div>

            <dl className="mt-4 space-y-2 border-t border-hairline pt-4 text-sm">
              <Row label="アクセス">{salon.accessShort}</Row>
              <Row label="営業時間">
                {salon.hours}
                {salon.lastReception && `（最終受付 ${salon.lastReception}）`}
              </Row>
              <Row label="住所">{salon.address}</Row>
            </dl>

            <div className="mt-5 space-y-2.5">
              <a
                href={salon.reserveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-gold px-5 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(184,155,94,0.35)] transition-colors hover:bg-gold-dk"
              >
                この店舗をネット予約する
                <span aria-hidden>›</span>
              </a>
              <Link
                href={`/salons/${salon.code}`}
                className="flex min-h-12 w-full items-center justify-center rounded-full border border-gold bg-surface px-5 text-sm font-semibold text-gold-dk transition-colors hover:bg-gold-soft"
              >
                店舗の詳細・地図を見る
              </Link>
            </div>
          </li>
        ))}
      </ul>

      <section className="noble-card gold-hairline p-5">
        <h2 className="serif text-lg text-ink text-center">ご予約前にご確認ください</h2>
        <ul className="mt-3 space-y-2 text-sm text-ink leading-relaxed">
          {COMMON_NOTES.map((note) => (
            <li key={note} className="flex gap-2">
              <span className="text-gold text-[8px] mt-1.5 shrink-0" aria-hidden>
                ◆
              </span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-[14px] border border-dashed border-gold/50 bg-gold-soft/40 p-5 text-center">
        <h2 className="serif text-lg text-ink">ご予約がお済みのお客様へ</h2>
        <p className="text-sm text-ink mt-2 leading-relaxed">
          事前にカウンセリングシートをご記入いただくと、
          <br className="hidden sm:inline" />
          当日スムーズにご案内できます。
        </p>
        <Link
          href="/f/new"
          className="mt-4 inline-flex min-h-12 items-center justify-center rounded-full border border-gold bg-surface px-6 text-sm font-semibold text-gold-dk transition-colors hover:bg-gold-soft"
        >
          カウンセリングシートを記入する
        </Link>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-16 shrink-0 text-xs font-semibold text-muted pt-0.5">{label}</dt>
      <dd className="flex-1 text-ink leading-relaxed">{children}</dd>
    </div>
  );
}
