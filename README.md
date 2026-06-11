# Noble — ノーブル業務統合システム

エステサロン「ノーブル」（新宿店・新宿南口店・恵比寿店）の業務統合システムです。

アプリケーション本体は **[`noble-app/`](./noble-app/)** にあります。
セットアップ手順・画面一覧・動作確認手順は [`noble-app/README.md`](./noble-app/README.md) を参照してください。

## 機能

- **カルテ・来店記録**（KaruteKun 代替）: 今日ボード／空カルテの事前作成／チップ中心のカルテ入力／Before・After写真
- **回数券管理**: 消化・取消・未消化残高の自動計算・期限アラート
- **顧客対応メモ**: 注意フラグ・ピン留め申し送り・LINE導線
- **経営ダッシュボード**（管理者専用）: 売上KPI・売上構造分析・媒体分析・メニュー/部位分析・スタッフ実績・シミュレーション
- **シフト・共有カレンダー**（TimeTree 代替）: 絵文字チップの月間カレンダー・希望提出→確定→確認→勤務実績

## 技術スタック

Next.js 16（App Router）+ TypeScript + Tailwind CSS v4 + Supabase（Postgres / Auth / Storage / RLS）

---

旧経営ダッシュボード（単一 `index.html` ＋ Google Apps Script 構成）は全機能を本システムへ移植済みのため削除しました。
必要な場合は git 履歴（`git log -- index.html`）から参照できます。
