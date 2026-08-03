"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, Card, SectionTitle } from "@/components/ui";
import { AdminTabs } from "@/components/admin-tabs";
import { SALONS, lineAddUrl, mapLinkUrl } from "@/lib/salons";

// お客様向け店舗紹介ページ（/salons）の確認・URL配布用（管理者専用）
export default function AdminStoresPage() {
  const origin = useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : ""),
    []
  );

  return (
    <div className="space-y-5 fade-in">
      <AdminTabs />
      <div>
        <h1 className="serif text-3xl text-ink">店舗紹介ページ</h1>
        <p className="text-sm text-muted mt-1">
          お客様向けの店舗一覧・ご予約ページです。LINEリッチメニューの「ご予約」ボタンの遷移先に使います
        </p>
      </div>

      {/* リッチメニューに設定するURL */}
      <Card className="p-4 space-y-3">
        <SectionTitle>リッチメニューに設定するURL</SectionTitle>
        <p className="text-sm text-ink">
          お客様が「ご予約」をタップすると、下のURLが開きます。店舗はページ内で選んでいただくため、
          <strong>設定するURLは1つだけ</strong>です。
        </p>
        <CopyRow url={`${origin}/salons`} />
        <div className="flex flex-wrap gap-2 pt-1">
          <LinkButton href="/salons" newTab>
            ページを開いて確認
          </LinkButton>
          <LinkButton href="/admin/line" variant="ghost">
            LINE連携の設定へ
          </LinkButton>
        </div>
        <p className="text-xs text-muted">
          設定手順は{" "}
          <Link href="/help#line" className="text-gold-dk underline underline-offset-2">
            使い方ガイドのLINEリッチメニュー
          </Link>{" "}
          を参照してください。
        </p>
      </Card>

      {/* 店舗ごとの掲載内容 */}
      {SALONS.map((salon) => (
        <Card key={salon.code} className="p-4 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="serif text-xl text-ink">{salon.name}</h2>
            <span className="serif text-[10px] tracking-[0.3em] text-gold-dk">
              {salon.nameEn}
            </span>
          </div>

          <CopyRow url={`${origin}/salons/${salon.code}`} />

          <dl className="text-sm divide-y divide-hairline">
            <Row label="住所">{salon.address}</Row>
            <Row label="アクセス">{salon.accessShort}</Row>
            <Row label="営業時間">
              {salon.hours}
              {salon.lastReception && `（最終受付 ${salon.lastReception}）`}
            </Row>
            <Row label="定休日">{salon.closedDays}</Row>
            <Row label="電話">{salon.tel ?? "掲載なし（LINEでの問い合わせのみ）"}</Row>
            <Row label="LINE">
              <a
                href={lineAddUrl(salon.lineId)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gold-dk underline underline-offset-2"
              >
                {salon.lineId}
              </a>
            </Row>
            <Row label="ネット予約">
              <a
                href={salon.reserveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gold-dk underline underline-offset-2 break-all"
              >
                {salon.reserveSite}
              </a>
            </Row>
            <Row label="地図">
              <a
                href={mapLinkUrl(salon.mapQuery)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gold-dk underline underline-offset-2"
              >
                Googleマップで表示位置を確認
              </a>
            </Row>
          </dl>

          <LinkButton href={`/salons/${salon.code}`} newTab>
            この店舗のページを確認
          </LinkButton>
        </Card>
      ))}

      <Card className="p-4">
        <SectionTitle>掲載内容の変更について</SectionTitle>
        <p className="text-sm text-ink mt-2 leading-relaxed">
          営業時間・道案内・注意事項などの掲載内容は、開発担当が
          <code className="bg-base border border-hairline rounded px-1 mx-1 text-xs">
            src/lib/salons.ts
          </code>
          を編集して反映します。変更したい箇所をお伝えください。
        </p>
      </Card>
    </div>
  );
}

/* Button と同じ見た目のリンク（a の中に button を入れないため） */
function LinkButton({
  href,
  newTab = false,
  variant = "secondary",
  children,
}: {
  href: string;
  newTab?: boolean;
  variant?: "secondary" | "ghost";
  children: React.ReactNode;
}) {
  const styles = {
    secondary: "bg-surface text-gold-dk border border-gold hover:bg-gold-soft",
    ghost: "bg-transparent text-muted hover:text-ink hover:bg-gold-soft",
  } as const;
  return (
    <Link
      href={href}
      {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={`inline-flex items-center justify-center gap-1.5 min-h-11 rounded-full px-5 text-sm font-semibold transition-all duration-150 ${styles[variant]}`}
    >
      {children}
    </Link>
  );
}

function CopyRow({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("このURLをコピーしてください", url);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 text-xs bg-base border border-hairline rounded-lg px-2 py-2 break-all">
        {url || "…"}
      </code>
      <Button variant="ghost" onClick={copy} disabled={!url}>
        {copied ? "✓" : "コピー"}
      </Button>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2 first:pt-0 last:pb-0">
      <dt className="w-20 shrink-0 text-xs font-semibold text-muted pt-0.5">{label}</dt>
      <dd className="flex-1 text-ink leading-relaxed">{children}</dd>
    </div>
  );
}
