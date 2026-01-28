# 🛡️ すぐに適用できるコード保護

index.htmlにコピペするだけで使える保護コードをまとめました。

---

## 🎯 推奨: レベル2保護（著作権 + 基本防御）

### ステップ1: HTMLの先頭に著作権表示を追加

index.htmlの`<head>`タグの直後に以下を追加：

```html
<head>
    <meta charset="UTF-8">
    <title>LuxeMetrics - Salon Analytics Dashboard</title>

    <!--
    ╔════════════════════════════════════════════════════════════════╗
    ║  LuxeMetrics - エステサロン経営ダッシュボード                    ║
    ║  Copyright (c) 2026 [あなたの会社名]                            ║
    ║  All Rights Reserved.                                          ║
    ║                                                                ║
    ║  このソフトウェアは著作権法により保護されています。              ║
    ║  無断での複製、改変、配布、商用利用を禁止します。                ║
    ║                                                                ║
    ║  Unauthorized copying, modification, distribution,             ║
    ║  or commercial use is strictly prohibited.                    ║
    ╚════════════════════════════════════════════════════════════════╝
    -->

    <!-- 以下、既存のコード -->
```

---

### ステップ2: `<body>`タグの直後に基本防御を追加

index.htmlの`<body>`の直後（`<div id="root"></div>`の前）に以下を追加：

```html
<body>
    <!-- コピー防止スクリプト -->
    <script>
        (function() {
            'use strict';

            // 著作権情報
            const COPYRIGHT = {
                owner: 'あなたの会社名',
                year: 2026,
                product: 'LuxeMetrics',
                version: '1.0'
            };

            // コンソールに警告を表示
            console.log('%c⚠️ 警告 / WARNING', 'color: red; font-size: 20px; font-weight: bold;');
            console.log(`%cこのアプリケーションは著作権法により保護されています。
Copyright (c) ${COPYRIGHT.year} ${COPYRIGHT.owner}
無断での複製、改変、配布を禁止します。

This software is protected by copyright law.
Unauthorized copying, modification, or distribution is prohibited.`, 'font-size: 14px;');

            // 右クリック禁止
            document.addEventListener('contextmenu', function(e) {
                e.preventDefault();
                alert('⚠️ 右クリックは無効化されています。\nThis action is disabled.');
                return false;
            });

            // キーボードショートカット禁止
            document.addEventListener('keydown', function(e) {
                // Ctrl+U, Ctrl+S, Ctrl+Shift+I (ソース表示・保存・デベロッパーツール)
                if (e.ctrlKey && (e.keyCode === 85 || e.keyCode === 83 ||
                    (e.shiftKey && e.keyCode === 73))) {
                    e.preventDefault();
                    alert('⚠️ この操作は無効化されています。');
                    return false;
                }
                // F12 (デベロッパーツール)
                if (e.keyCode === 123) {
                    e.preventDefault();
                    alert('⚠️ この操作は無効化されています。');
                    return false;
                }
            });

            // テキスト選択禁止（オプション - 使いづらくなる可能性あり）
            // document.addEventListener('selectstart', function(e) {
            //     e.preventDefault();
            //     return false;
            // });

            // デベロッパーツール検知
            let devtoolsOpen = false;
            const element = new Image();
            Object.defineProperty(element, 'id', {
                get: function() {
                    devtoolsOpen = true;
                    console.clear();
                    document.body.innerHTML = `
                        <div style="display: flex; justify-content: center; align-items: center; height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                            <div style="text-align: center; color: white; padding: 40px; background: rgba(0,0,0,0.3); border-radius: 20px; max-width: 600px;">
                                <h1 style="font-size: 48px; margin-bottom: 20px;">⚠️</h1>
                                <h2 style="font-size: 32px; margin-bottom: 20px;">アクセス制限</h2>
                                <p style="font-size: 18px; line-height: 1.8;">
                                    このアプリケーションは著作権により保護されています。<br>
                                    デベロッパーツールの使用は禁止されています。<br><br>
                                    <strong>Copyright © ${COPYRIGHT.year} ${COPYRIGHT.owner}</strong><br>
                                    All Rights Reserved.
                                </p>
                                <p style="font-size: 14px; margin-top: 30px; opacity: 0.8;">
                                    不正な利用は法的措置の対象となる場合があります。
                                </p>
                            </div>
                        </div>
                    `;
                }
            });

            // 定期チェック
            setInterval(function() {
                console.log(element);
                console.clear();
            }, 1000);

        })();
    </script>

    <!-- 既存のコード -->
    <div id="root"></div>
```

---

## 🔐 オプション: GAS認証の追加（より強力）

### ステップ3: GASに認証を追加

`gas/Code.gs`の先頭に追加：

```javascript
/**
 * 認証設定
 */
const AUTH_CONFIG = {
    // この秘密キーを変更してください（ランダムな文字列）
    API_KEY: 'YOUR_SECRET_KEY_CHANGE_THIS_12345',

    // 許可されたユーザーのメールアドレス
    ALLOWED_USERS: [
        'user1@example.com',
        'user2@example.com'
        // 必要に応じて追加
    ]
};

/**
 * リクエストを認証
 */
function authenticateRequest(apiKey, userEmail) {
    // APIキーのチェック
    if (apiKey !== AUTH_CONFIG.API_KEY) {
        Logger.log('認証失敗: 無効なAPIキー');
        return { success: false, message: '認証に失敗しました' };
    }

    // ユーザーのチェック（オプション）
    if (userEmail && !AUTH_CONFIG.ALLOWED_USERS.includes(userEmail)) {
        Logger.log('認証失敗: 未許可のユーザー - ' + userEmail);
        return { success: false, message: 'アクセスが許可されていません' };
    }

    return { success: true };
}

/**
 * POSTリクエスト対応（認証追加版）
 * 既存のdoPost関数を以下に置き換え
 */
function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);

        // 🔐 認証チェック
        const authResult = authenticateRequest(data.apiKey, data.userEmail);
        if (!authResult.success) {
            return createResponse(false, authResult.message);
        }

        // 既存の処理
        const action = data.action;
        switch(action) {
            case 'saveDailySales': return saveDailySales(data.salesData);
            case 'saveMenuSales': return saveMenuSales(data.menuData);
            case 'saveStaffPerformance': return saveStaffPerformance(data.staffData);
            case 'saveTicketMasters': return saveTicketMasters(data.ticketData);
            case 'saveCustomers': return saveCustomers(data.customerData);
            case 'saveMenus': return saveMenus(data.menuData);
            case 'saveMediaSources': return saveMediaSources(data.mediaData);
            case 'saveAllData': return saveAllData(data);
            case 'getAllData': return getAllData();
            case 'getDailySales': return getDailySales(data.startDate, data.endDate);
            default: return createResponse(false, 'Unknown action: ' + action);
        }
    } catch (error) {
        Logger.log('POSTエラー: ' + error.toString());
        return createResponse(false, error.toString());
    }
}

/**
 * GETリクエスト対応（認証追加版）
 */
function doGet(e) {
    try {
        // 🔐 認証チェック（GETの場合はパラメータから）
        const apiKey = e.parameter.apiKey;
        const authResult = authenticateRequest(apiKey);
        if (!authResult.success) {
            return ContentService.createTextOutput(JSON.stringify({
                status: 'error',
                message: authResult.message
            })).setMimeType(ContentService.MimeType.JSON);
        }

        const action = e.parameter.action;
        if (action === 'getAllData') {
            return getAllData();
        }

        return ContentService.createTextOutput(JSON.stringify({
            status: 'ok',
            message: 'エステサロンダッシュボードAPI',
            availableActions: ['getAllData']
        })).setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        Logger.log('GETエラー: ' + error.toString());
        return ContentService.createTextOutput(JSON.stringify({
            status: 'error',
            message: error.toString()
        })).setMimeType(ContentService.MimeType.JSON);
    }
}
```

### ステップ4: index.htmlにAPIキーを追加

index.htmlの`GAS_WEB_APP_URL`の下に追加：

```javascript
// GASのWebアプリURL
const GAS_WEB_APP_URL = 'あなたのデプロイURL';

// 🔐 認証情報（GASで設定した秘密キーと同じものを使用）
const API_KEY = 'YOUR_SECRET_KEY_CHANGE_THIS_12345';
const USER_EMAIL = 'user1@example.com';  // オプション
```

### ステップ5: データ送信時に認証情報を含める

`saveToSpreadsheet`関数を修正（index.html内）：

```javascript
const saveToSpreadsheet = async (action, data) => {
    try {
        const response = await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: action,
                apiKey: API_KEY,      // 🔐 認証情報を追加
                userEmail: USER_EMAIL, // 🔐 認証情報を追加
                ...data
            })
        });
        return { success: true };
    } catch (error) {
        console.error('保存エラー:', error);
        return { success: false, error: error.message };
    }
};
```

---

## 📋 適用チェックリスト

適用後、以下を確認してください：

### 基本保護（レベル2）
- [ ] 著作権表示を追加した
- [ ] 右クリック禁止を追加した
- [ ] キーボードショートカット禁止を追加した
- [ ] デベロッパーツール検知を追加した
- [ ] ブラウザで動作確認した

### GAS認証（レベル3）
- [ ] GASにAUTH_CONFIGを追加した
- [ ] API_KEYをランダムな文字列に変更した
- [ ] ALLOWED_USERSにメールアドレスを追加した
- [ ] doPost関数に認証チェックを追加した
- [ ] doGet関数に認証チェックを追加した
- [ ] index.htmlにAPI_KEYを追加した
- [ ] saveToSpreadsheet関数を修正した
- [ ] GASを再デプロイした
- [ ] 認証が正しく動作するか確認した

---

## ⚠️ 重要な注意事項

### やってはいけないこと
- ❌ API_KEYをGitHubなどに公開しない
- ❌ 秘密キーをデフォルトのまま使用しない
- ❌ 共有する相手にAPIキーを教えない

### やるべきこと
- ✅ API_KEYは複雑でランダムな文字列にする
- ✅ 定期的にAPIキーを変更する
- ✅ アクセスログを確認する
- ✅ 利用規約を明示する

---

## 🎯 まとめ

**最小限の保護（5分で完了）:**
```
✅ 著作権表示
✅ 右クリック禁止
```

**推奨保護（15分で完了）:**
```
✅ 著作権表示
✅ 右クリック禁止
✅ デベロッパーツール検知
✅ GAS認証
```

どちらを適用しますか？
具体的な実装をサポートします！
