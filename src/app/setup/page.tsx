import Image from "next/image";

// Supabase 未設定時のセットアップ案内（環境変数が設定されると自動的に / へ戻る）
export default function SetupPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg fade-in">
        <div className="text-center mb-8">
          <Image src="/logo.png" alt="ESTHETIC BY NOBLE" width={150} height={141} priority className="mx-auto" />
          <p className="mt-4 text-sm text-muted tracking-widest">セットアップが必要です</p>
        </div>

        <div className="noble-card gold-hairline p-6 space-y-4 text-sm text-ink leading-relaxed">
          <p>
            アプリは正常にデプロイされていますが、データベース（Supabase）への接続情報が
            まだ設定されていません。
          </p>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              <a
                href="https://supabase.com"
                className="text-gold-dk underline underline-offset-2"
                target="_blank"
                rel="noopener noreferrer"
              >
                Supabase
              </a>
              でプロジェクトを作成し、SQL Editor で <code className="bg-base px-1 rounded">supabase/migrations/</code> の
              001〜014 を順に実行
            </li>
            <li>
              Vercel → Settings → <strong>Environment Variables</strong> に以下を設定
              <ul className="list-disc pl-5 mt-1 space-y-0.5 text-muted">
                <li><code className="bg-base px-1 rounded">NEXT_PUBLIC_SUPABASE_URL</code></li>
                <li><code className="bg-base px-1 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</code></li>
                <li><code className="bg-base px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code></li>
              </ul>
            </li>
            <li>Vercel で <strong>Redeploy</strong>（環境変数はビルド時に取り込まれます）</li>
          </ol>
          <p className="text-muted text-xs">
            詳しい手順はリポジトリの README.md を参照してください。設定が完了すると、
            このページは自動的にサインイン画面に切り替わります。
          </p>
        </div>
      </div>
    </main>
  );
}
