import Link from "next/link";

// 存在しない店舗コードでアクセスされたとき
export default function SalonNotFound() {
  return (
    <div className="py-10 text-center">
      <p className="text-gold text-xs mb-3" aria-hidden>
        ◆
      </p>
      <h1 className="serif text-2xl text-ink">店舗が見つかりませんでした</h1>
      <p className="text-sm text-muted mt-2">
        URLが変更された可能性があります。店舗一覧からお選びください。
      </p>
      <Link
        href="/salons"
        className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full border border-gold bg-surface px-6 text-sm font-semibold text-gold-dk transition-colors hover:bg-gold-soft"
      >
        店舗一覧を見る
      </Link>
    </div>
  );
}
