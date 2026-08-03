import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  COMMON_NOTES,
  PAYMENT_METHODS,
  SALONS,
  findSalon,
  lineAddUrl,
  mapEmbedUrl,
  mapLinkUrl,
  telHref,
} from "@/lib/salons";

// 3店舗ぶんを事前生成（内容は静的なのでリクエスト時の処理は不要）
export function generateStaticParams() {
  return SALONS.map((s) => ({ code: s.code }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const salon = findSalon(code);
  if (!salon) return { title: "店舗が見つかりません | ノーブル" };
  return {
    title: `${salon.name} | ハーブピーリング専門店 ノーブル`,
    description: `${salon.name}（${salon.accessShort}）のご案内。${salon.address}／営業時間 ${salon.hours}。アクセス・地図・ご予約はこちらから。`,
  };
}

// お客様向けの店舗紹介ページ（認証不要）
export default async function SalonDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const salon = findSalon(code);
  if (!salon) notFound();

  const others = SALONS.filter((s) => s.code !== salon.code);

  return (
    <div className="space-y-6 fade-in">
      <Link
        href="/salons"
        className="inline-flex min-h-11 items-center text-sm text-muted transition-colors hover:text-ink"
      >
        ‹ 店舗一覧にもどる
      </Link>

      {/* 店舗名 */}
      <div className="text-center">
        <h1 className="serif text-3xl text-ink tracking-wide">{salon.name}</h1>
        <p className="serif text-[10px] tracking-[0.35em] text-gold-dk mt-1.5 pl-[0.35em]">
          {salon.nameEn}
        </p>
        <p className="text-sm text-ink mt-3 leading-relaxed">{salon.catch}</p>
      </div>

      {/* ご予約導線 */}
      <section className="noble-card gold-hairline p-5">
        <h2 className="serif text-lg text-ink text-center">ご予約</h2>
        <a
          href={salon.reserveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-gold px-5 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(184,155,94,0.35)] transition-colors hover:bg-gold-dk"
        >
          24時間ネット予約する
          <span aria-hidden>›</span>
        </a>
        <p className="text-[11px] text-muted text-center mt-2">
          {salon.reserveSite}の予約ページが開きます
        </p>

        {/* 電話番号のない店舗はLINEのみを大きく出す */}
        <div
          className={`mt-4 grid grid-cols-1 gap-2.5 ${salon.tel ? "sm:grid-cols-2" : ""}`}
        >
          <a
            href={lineAddUrl(salon.lineId)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 items-center justify-center rounded-full border border-gold bg-surface px-4 text-sm font-semibold text-gold-dk transition-colors hover:bg-gold-soft"
          >
            LINEで問い合わせる（{salon.lineId}）
          </a>
          {salon.tel && (
            <a
              href={telHref(salon.tel)}
              className="flex min-h-12 items-center justify-center rounded-full border border-gold bg-surface px-4 text-sm font-semibold text-gold-dk transition-colors hover:bg-gold-soft"
            >
              電話する（{salon.tel}）
            </a>
          )}
        </div>
      </section>

      {/* 基本情報 */}
      <section className="noble-card gold-hairline p-5">
        <h2 className="serif text-lg text-ink text-center">店舗情報</h2>
        <dl className="mt-4 divide-y divide-hairline text-sm">
          <Row label="住所">{salon.address}</Row>
          <Row label="アクセス">
            <ul className="space-y-0.5">
              {salon.accessLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Row>
          <Row label="営業時間">
            {salon.hours}
            {salon.lastReception && (
              <span className="text-muted">（最終受付 {salon.lastReception}）</span>
            )}
          </Row>
          <Row label="定休日">{salon.closedDays}</Row>
          <Row label="設備">{salon.facility}</Row>
          <Row label="スタッフ">{salon.staffCount}</Row>
          {salon.priceRange && (
            <Row label="価格帯">
              初回 {salon.priceRange.first} ／ 2回目以降 {salon.priceRange.repeat}
            </Row>
          )}
          <Row label="お支払い">{PAYMENT_METHODS.join("／")}</Row>
          <Row label="駐車場">なし（近隣コインパーキングをご利用ください）</Row>
        </dl>
      </section>

      {/* 地図 */}
      <section className="noble-card gold-hairline overflow-hidden">
        <div className="p-5 pb-3">
          <h2 className="serif text-lg text-ink text-center">地図</h2>
        </div>
        <iframe
          title={`${salon.name}の地図`}
          src={mapEmbedUrl(salon.mapQuery)}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="block h-64 w-full border-y border-hairline sm:h-80"
        />
        <div className="p-5 pt-4">
          <a
            href={mapLinkUrl(salon.mapQuery)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 w-full items-center justify-center rounded-full border border-gold bg-surface px-5 text-sm font-semibold text-gold-dk transition-colors hover:bg-gold-soft"
          >
            地図アプリで開く（経路案内）
          </a>
        </div>
      </section>

      {/* 道案内 */}
      <section className="noble-card gold-hairline p-5">
        <h2 className="serif text-lg text-ink text-center">道案内</h2>
        <p className="mt-3 whitespace-pre-line text-sm text-ink leading-relaxed">
          {salon.directions}
        </p>
      </section>

      {/* ご来店にあたって */}
      <section className="rounded-[14px] border border-warn/30 bg-warn-soft/60 p-5">
        <h2 className="serif text-lg text-ink text-center">ご来店にあたってのお願い</h2>
        <ul className="mt-3 space-y-2 text-sm text-ink leading-relaxed">
          {[...salon.notes, ...COMMON_NOTES].map((note) => (
            <li key={note} className="flex gap-2">
              <span className="text-warn text-[8px] mt-1.5 shrink-0" aria-hidden>
                ◆
              </span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 特徴 */}
      <section className="noble-card gold-hairline p-5">
        <h2 className="serif text-lg text-ink text-center">この店舗の特徴</h2>
        <ul className="mt-4 flex flex-wrap justify-center gap-2">
          {salon.features.map((f) => (
            <li
              key={f}
              className="rounded-full border border-hairline bg-base px-3 py-1.5 text-xs text-ink"
            >
              {f}
            </li>
          ))}
        </ul>
        <a
          href={salon.hpbUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 block text-center text-xs text-gold-dk underline underline-offset-2"
        >
          メニュー・クーポン・口コミを見る（ホットペッパービューティー）
        </a>
      </section>

      {/* 他店舗 */}
      <section>
        <div className="ornament-divider my-2">
          <span className="text-[8px] leading-none" aria-hidden>
            ◆
          </span>
          <h2 className="serif text-base text-ink whitespace-nowrap">ほかの店舗</h2>
          <span className="text-[8px] leading-none" aria-hidden>
            ◆
          </span>
        </div>
        <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {others.map((o) => (
            <li key={o.code}>
              <Link
                href={`/salons/${o.code}`}
                className="flex min-h-14 flex-col justify-center rounded-[14px] border border-hairline bg-surface px-4 py-2 transition-colors hover:border-gold"
              >
                <span className="serif text-base text-ink">{o.name}</span>
                <span className="text-[11px] text-muted">{o.accessShort}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
      <dt className="w-20 shrink-0 text-xs font-semibold text-muted pt-0.5">{label}</dt>
      <dd className="flex-1 text-ink leading-relaxed">{children}</dd>
    </div>
  );
}
