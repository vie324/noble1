# ノーブル業務システム（noble-app）— Phase 0 雛形

KaruteKun / TimeTree を段階的に統合する業務基盤の土台です。
**Next.js (App Router) + Supabase + Tailwind CSS** で構成しています。

## この雛形に含まれるもの

- 認証（Supabase Auth・メール/パスワード）と全ルートの保護（middleware）
- 役割（admin / manager / staff）・店舗を考慮した RLS スキーマ
- 中核データモデル：顧客 / 来店記録（カルテ）/ 回数券（**台帳方式**）
- カルテ画面（Phase 1 の核）
  - 「今日」の来店一覧（全店舗合算／店舗別の切替）
  - **未記入カルテの強調表示**（記入漏れ防止）
  - カルテ詳細：施術明細・回数券消化・メモ・記入済化
- ダッシュボード雛形（本日来店 / 未記入 / 回数券未消化残高 / 期限間近）

## セットアップ

```bash
cd noble-app
npm install

# 1) Supabase プロジェクトを Tokyo リージョンで作成
# 2) supabase/migrations/*.sql と supabase/seed.sql を SQL Editor で実行
#    (または supabase CLI: supabase db reset)
# 3) 環境変数を設定
cp .env.example .env.local   # URL / anon key を記入

npm run dev   # http://localhost:3000
```

### 初回ログインユーザーの作成

Supabase ダッシュボードの Authentication でユーザーを作成し、`staff` テーブルに
同じ id で行を追加（`role='admin'`）してください。

```sql
insert into staff (id, full_name, role)
values ('<auth.users の id>', '坂井', 'admin');
```

## ディレクトリ構成

```
noble-app/
├── middleware.ts                 認証チェック
├── supabase/
│   ├── migrations/0001_init.sql  中核スキーマ + RLS
│   ├── migrations/0002_rpc.sql   業務ロジック(空カルテ/回数券消化)
│   └── seed.sql                  開発用サンプルデータ
└── src/
    ├── lib/supabase/             クライアント(browser/server/middleware)
    ├── lib/types.ts              ドメイン型
    ├── components/Sidebar.tsx
    └── app/
        ├── login/                ログイン
        └── (app)/                認証後レイアウト
            ├── page.tsx          ダッシュボード
            ├── karte/            カルテ(今日の来店/詳細)
            ├── customers/        顧客
            └── tickets/          回数券残高
```

## 注意

- 本雛形は**動作イメージの擦り合わせ用**です。施術部位の入力UI（部位マップ）、
  写真アップロード、空カルテの一括生成UIなどは Phase 1 本実装で追加します。
- 型は暫定の手書き（`src/lib/types.ts`）。本実装では
  `supabase gen types typescript` で自動生成に切り替えます。
