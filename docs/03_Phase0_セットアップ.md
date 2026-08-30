# Phase 0 セットアップ手順（Vercel + Supabase）

このドキュメントは、`noble-app/` の雛形を実際に動かすまでの手順をまとめたものです。

## 0. 前提

- Node.js 18+ / npm
- Supabase アカウント（まず坂井さんアカウントで作成。本番化時にノーブル様 Organization へ移管）
- Vercel アカウント

## 1. Supabase プロジェクト作成

1. Supabase で新規プロジェクトを作成。**Region は Tokyo (ap-northeast-1)** を選択。
2. プロジェクト作成後、SQL Editor で以下を順に実行：
   - `noble-app/supabase/migrations/0001_init.sql`
   - `noble-app/supabase/migrations/0002_rpc.sql`
   - （動作確認用に）`noble-app/supabase/seed.sql`
3. Project Settings → API から `URL` と `anon key` を控える。

> Supabase CLI を使う場合：`supabase link` 後 `supabase db reset` で一括適用。

## 2. ローカル起動

```bash
cd noble-app
npm install
cp .env.example .env.local   # URL / anon key を記入
npm run dev
```

## 3. 管理者ユーザー作成

1. Supabase → Authentication → Users で坂井さんのユーザーを作成。
2. SQL Editor で `staff` に紐付け：

```sql
insert into staff (id, full_name, role)
values ('<作成した user の id>', '坂井', 'admin');
```

3. `http://localhost:3000/login` からログイン。

## 4. Vercel デプロイ

1. このリポジトリを Vercel に Import。**Root Directory を `noble-app` に設定**。
2. Environment Variables に `.env.local` と同じ値を登録
   （`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`）。
3. Deploy。発行URLを iPad のホーム画面に追加すればアプリのように使えます。

## 5. 確認できること

- ログイン → ダッシュボード（本日来店 / 未記入 / 回数券残高 / 期限間近）
- カルテ「今日」一覧で **全店舗 / 店舗別** 切替、未記入の赤バッジ
- カルテ詳細で施術明細・回数券の1回消化・メモ保存→記入済化
- 回数券一覧で台帳から算出された未消化残高

## 次の実装（Phase 1 本実装で追加予定）

- 予約一覧からの **空カルテ一括生成UI**
- 施術部位の **部位マップ/チップ入力**
- 施術前後 **写真アップロード**（Supabase Storage）
- 顧客詳細の **過去カルテ履歴**
- iPad 2ペインレイアウトの最適化・オフライン耐性
