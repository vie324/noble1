# HTMLコード保護ガイド

このドキュメントでは、HTMLコードを共有する際の保護方法をまとめています。

**重要:** クライアントサイド（ブラウザ）で動作するコードは、技術的に完全に隠すことは不可能です。ここで紹介する方法は「簡単にコピーされるハードルを上げる」ためのものです。

---

## 📊 保護レベル比較

| 方法 | 効果 | 難易度 | コスト |
|------|------|--------|--------|
| 著作権表示 | ★☆☆☆☆ | 簡単 | 無料 |
| 右クリック禁止 | ★☆☆☆☆ | 簡単 | 無料 |
| コード難読化 | ★★★☆☆ | 中 | 無料 |
| GAS認証 | ★★★★☆ | 中～高 | 無料 |
| ウェブアプリ化 | ★★★★★ | 高 | 有料 |

---

## 🛡️ レベル1: 基本的な保護（簡単）

### 1-1. 著作権表示の追加

index.htmlの冒頭に追加：

```html
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>LuxeMetrics - Salon Analytics Dashboard</title>

    <!--
    ================================================================
    LuxeMetrics - エステサロン経営ダッシュボード
    Copyright (c) 2026 [あなたの会社名/名前]
    All Rights Reserved.

    このソフトウェアは著作権法により保護されています。
    無断での複製、改変、配布、商用利用を禁止します。

    Unauthorized copying, modification, distribution, or
    commercial use of this software is strictly prohibited.
    ================================================================
    -->
```

### 1-2. 右クリック禁止（簡易版）

index.htmlの`<body>`タグの直後に追加：

```html
<body>
    <script>
        // 右クリック禁止
        document.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            return false;
        });

        // Ctrl+U（ソース表示）禁止
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey && (e.keyCode === 85 || e.keyCode === 83 || e.keyCode === 73)) {
                e.preventDefault();
                return false;
            }
        });

        // F12（デベロッパーツール）禁止
        document.addEventListener('keydown', function(e) {
            if (e.keyCode === 123) {
                e.preventDefault();
                return false;
            }
        });
    </script>
```

**注意:** これらは簡単に回避できます。プロのエンジニアには効果がありません。

---

## 🔐 レベル2: コードの難読化（中級）

### 2-1. 変数名・関数名のランダム化

JavaScriptの変数名を意味のない名前に変更します。

**難読化前:**
```javascript
const staffList = [...];
const calculateTotal = (data) => { ... };
```

**難読化後:**
```javascript
const _0x1a2b = [...];
const _0x3c4d = (_0x5e6f) => { ... };
```

### 2-2. 自動難読化ツールの使用

**オンラインツール:**
- JavaScript Obfuscator: https://obfuscator.io/
- UglifyJS: https://skalman.github.io/UglifyJS-online/

**使い方:**
1. index.htmlから`<script type="text/babel">`内のJavaScriptコードをコピー
2. 上記ツールに貼り付け
3. 難読化されたコードを取得
4. index.htmlに戻す

**デメリット:**
- デバッグが困難になる
- ファイルサイズが増える
- 完全な保護ではない

---

## 🔒 レベル3: GAS認証による保護（推奨）

重要なデータとロジックをGAS側に移動し、認証を追加します。

### 3-1. GASに認証機能を追加

`gas/Code.gs`の冒頭に追加：

```javascript
// 許可されたユーザーのリスト
const ALLOWED_USERS = [
    'user1@example.com',
    'user2@example.com'
];

// 認証キー（ランダムな文字列）
const AUTH_KEY = 'あなたの秘密キー_ランダムな文字列123456';

/**
 * リクエストを認証
 */
function authenticateRequest(apiKey, userEmail) {
    // APIキーのチェック
    if (apiKey !== AUTH_KEY) {
        return { success: false, message: '認証に失敗しました' };
    }

    // ユーザーのチェック
    if (!ALLOWED_USERS.includes(userEmail)) {
        return { success: false, message: 'アクセスが許可されていません' };
    }

    return { success: true };
}

/**
 * POSTリクエスト対応（認証追加版）
 */
function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);

        // 認証チェック
        const authResult = authenticateRequest(data.apiKey, data.userEmail);
        if (!authResult.success) {
            return createResponse(false, authResult.message);
        }

        // 既存の処理
        const action = data.action;
        switch(action) {
            // ... 既存のコード
        }
    } catch (error) {
        return createResponse(false, error.toString());
    }
}
```

### 3-2. index.htmlに認証情報を追加

```javascript
// ユーザー認証情報（環境変数として管理）
const API_KEY = 'あなたの秘密キー_ランダムな文字列123456';
const USER_EMAIL = 'user1@example.com';

// データ保存時に認証情報を含める
const saveToSpreadsheet = async (action, data) => {
    const response = await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: action,
            apiKey: API_KEY,
            userEmail: USER_EMAIL,
            ...data
        })
    });
};
```

**メリット:**
- コピーされても認証がないと動作しない
- データアクセスを制御できる
- 不正利用を防げる

**デメリット:**
- 実装がやや複雑
- API_KEYが漏れると無意味

---

## 🚫 レベル4: デベロッパーツール検知

```javascript
// デベロッパーツールの検知
(function() {
    const element = new Image();
    let devtoolsOpen = false;

    Object.defineProperty(element, 'id', {
        get: function() {
            devtoolsOpen = true;
            // 警告表示
            document.body.innerHTML = '<div style="padding: 40px; text-align: center;"><h1>⚠️ 警告</h1><p>このアプリケーションは著作権で保護されています。<br>不正な利用は法的措置の対象となります。</p></div>';
        }
    });

    setInterval(function() {
        devtoolsOpen = false;
        console.log(element);
        console.clear();
    }, 1000);
})();
```

**注意:** これも回避可能です。

---

## ⚡ レベル5: ウェブアプリケーション化（最強）

### 5-1. サーバーサイドレンダリング

HTMLをサーバー側で生成し、クライアントには最小限のコードのみ送信。

**技術スタック例:**
- Next.js + Vercel
- Node.js + Express
- Python + Flask/Django

**メリット:**
- コアロジックがサーバー側にある
- クライアント側のコードは最小限
- 高い保護レベル

**デメリット:**
- 開発コストが高い
- サーバー費用が必要
- 現在のHTMLファイルとは別物になる

---

## 📝 推奨する組み合わせ

### 一般的な共有の場合
```
✅ 著作権表示
✅ 右クリック禁止
✅ 簡易的な難読化
```

### ビジネス利用の場合
```
✅ 著作権表示
✅ GAS認証
✅ コード難読化
✅ デベロッパーツール検知
```

### 最高レベルの保護が必要な場合
```
✅ ウェブアプリケーション化
✅ サーバーサイド認証
✅ API Key管理
```

---

## ⚠️ 重要な注意事項

### できること
- ✅ 一般ユーザーによる簡単なコピーを防ぐ
- ✅ 著作権を主張する
- ✅ 不正利用を検知する
- ✅ データアクセスを制御する

### できないこと
- ❌ 完全にコードを隠す
- ❌ 技術者によるリバースエンジニアリングを防ぐ
- ❌ ブラウザに送信されたコードを見えなくする

---

## 🎯 現実的なアプローチ

1. **ライセンス条項を明記**
   - 著作権表示
   - 利用規約
   - 配布条件

2. **重要なロジックをGASに移動**
   - ビジネスロジック
   - データ処理
   - 計算式

3. **認証機能を追加**
   - APIキー
   - ユーザー管理
   - アクセスログ

4. **法的保護**
   - 著作権登録
   - 利用規約
   - NDA（秘密保持契約）

---

## 💡 結論

**完全な保護は不可能です**が、以下の組み合わせで「簡単にコピーされるリスク」を大幅に減らせます：

```
1. 著作権表示（必須）
2. GAS認証（推奨）
3. コード難読化（オプション）
4. 利用規約（推奨）
```

最も効果的なのは、**重要なビジネスロジックをGAS側に移動**し、**認証を実装**することです。

---

## 🚀 次のステップ

どのレベルの保護が必要か教えてください：

1. **レベル1（基本）**: 著作権表示のみ
2. **レベル2（中級）**: 著作権 + 難読化
3. **レベル3（推奨）**: 著作権 + GAS認証
4. **レベル4（高度）**: すべての組み合わせ
5. **レベル5（最強）**: ウェブアプリ化

希望のレベルを教えていただければ、具体的な実装をサポートします。
