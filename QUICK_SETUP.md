# 🚀 コピペで完了！スプレッドシート＆GAS設定ガイド

このガイドに従えば、**コピペだけ**でスプレッドシートとGASの設定が完了します。

---

## ⏱️ 所要時間：約10分

---

## 📝 手順の流れ

1. ✅ スプレッドシートを作成（2分）
2. ✅ GASコードをコピペ（3分）
3. ✅ デプロイしてURLを取得（3分）
4. ✅ index.htmlを更新（2分）

---

## ステップ1: スプレッドシートを作成

### 1-1. 新規スプレッドシートを作成

1. Google Drive（https://drive.google.com）を開く
2. 「新規」→「Googleスプレッドシート」→「空白のスプレッドシート」
3. 名前を「エステサロンデータ」に変更

### 1-2. スプレッドシートIDをコピー

ブラウザのアドレスバーから、以下の部分をコピー：

```
https://docs.google.com/spreadsheets/d/【この部分をコピー】/edit
```

例: `1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t`

**📋 メモ帳に貼り付けて保存しておいてください**

---

## ステップ2: Apps Script を設定

### 2-1. Apps Script エディタを開く

1. スプレッドシートで「拡張機能」→「Apps Script」をクリック
2. 既存のコード（`function myFunction() { ... }`）を**すべて削除**

### 2-2. GASコードをコピペ

**以下のコード全体をコピーして、Apps Scriptエディタに貼り付けてください。**

```javascript
/**
 * エステサロン経営ダッシュボード - Google Apps Script
 * 完全版 v2.0 - コピペ用
 */

// ============================================
// 【重要】ここに先ほどコピーしたスプレッドシートIDを貼り付けてください
// ============================================
const SPREADSHEET_ID = 'ここにスプレッドシートIDを貼り付け';
// 例: const SPREADSHEET_ID = '1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t';

// ============================================
// メインハンドラー（変更不要）
// ============================================

function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'getAllData') {
      return getAllData();
    }
    return createResponse(true, 'エステサロンダッシュボードAPI v2.0');
  } catch (error) {
    return createResponse(false, 'エラー: ' + error.toString());
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    switch(action) {
      case 'saveDailySales': return saveDailySales(data.salesData);
      case 'saveMenuSales': return saveMenuSales(data.menuData);
      case 'saveStaffPerformance': return saveStaffPerformance(data.staffData);
      case 'saveTicketMasters': return saveTicketMasters(data.ticketData);
      case 'saveCustomers': return saveCustomers(data.customerData);
      case 'saveAllData': return saveAllData(data);
      case 'getAllData': return getAllData();
      default: return createResponse(false, '不明なアクション');
    }
  } catch (error) {
    return createResponse(false, 'エラー: ' + error.toString());
  }
}

function createResponse(success, message, data = null) {
  const response = { success: success, message: message, timestamp: new Date().toISOString() };
  if (data !== null) response.data = data;
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// データ保存機能（変更不要）
// ============================================

function saveDailySales(salesData) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName('日次売上');

    if (!sheet) {
      sheet = ss.insertSheet('日次売上');
      sheet.appendRow(['日付', '店舗ID', '店舗名', '都度払い', '回数券販売', '回数券消化', '物販', '会計上売上', 'キャッシュイン', '登録日時']);
      const headerRange = sheet.getRange(1, 1, 1, 10);
      headerRange.setFontWeight('bold').setBackground('#d4af37').setFontColor('#ffffff');
    }

    const timestamp = new Date();
    salesData.forEach(entry => {
      sheet.appendRow([
        entry.date || '', entry.storeId || 0, entry.storeName || '',
        entry.spotSales || 0, entry.ticketSales || 0, entry.ticketUsage || 0,
        entry.product || 0, entry.accountingSales || 0, entry.cashIn || 0, timestamp
      ]);
    });

    return createResponse(true, '日次売上データを保存しました', { rowsAdded: salesData.length });
  } catch (error) {
    return createResponse(false, '保存エラー: ' + error.toString());
  }
}

function saveMenuSales(menuData) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName('メニュー別売上');

    if (!sheet) {
      sheet = ss.insertSheet('メニュー別売上');
      sheet.appendRow(['メニューID', 'メニュー名', '回数', '売上', '対応店舗', '登録日時']);
      sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#d4af37').setFontColor('#ffffff');
    }

    const lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 6).clearContent();

    const timestamp = new Date();
    menuData.forEach(menu => {
      const stores = menu.availableStores && menu.availableStores.length === 2 ? '両店舗' : '新宿南口店のみ';
      sheet.appendRow([menu.menuId, menu.menuName, menu.count || 0, menu.sales || 0, stores, timestamp]);
    });

    return createResponse(true, 'メニュー別売上データを保存しました', { rowsAdded: menuData.length });
  } catch (error) {
    return createResponse(false, '保存エラー: ' + error.toString());
  }
}

function saveStaffPerformance(staffData) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName('スタッフ実績');

    if (!sheet) {
      sheet = ss.insertSheet('スタッフ実績');
      sheet.appendRow(['スタッフID', 'スタッフ名', '役職', '店舗ID', '売上実績', '売上目標', '達成率(%)', '指名数', 'リピート率(%)', '満足度', '登録日時']);
      sheet.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#d4af37').setFontColor('#ffffff');
    }

    const lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 11).clearContent();

    const timestamp = new Date();
    staffData.forEach(staff => {
      const rate = staff.target > 0 ? Math.round((staff.sales / staff.target) * 100) : 0;
      sheet.appendRow([
        staff.id, staff.name, staff.role || '', staff.storeId,
        staff.sales || 0, staff.target || 0, rate, staff.nomination || 0,
        staff.retention || 0, staff.satisfaction || 0, timestamp
      ]);
    });

    return createResponse(true, 'スタッフ実績データを保存しました', { rowsAdded: staffData.length });
  } catch (error) {
    return createResponse(false, '保存エラー: ' + error.toString());
  }
}

function saveTicketMasters(ticketData) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName('回数券マスター');

    if (!sheet) {
      sheet = ss.insertSheet('回数券マスター');
      sheet.appendRow(['ID', '回数券名', '回数', '価格', '有効期限(月)', '説明', '登録日時']);
      sheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#d4af37').setFontColor('#ffffff');
    }

    const lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 7).clearContent();

    const timestamp = new Date();
    ticketData.forEach(ticket => {
      sheet.appendRow([
        ticket.id, ticket.name, ticket.sessions || 0, ticket.price || 0,
        ticket.validMonths || 0, ticket.description || '', timestamp
      ]);
    });

    return createResponse(true, '回数券マスターを保存しました', { rowsAdded: ticketData.length });
  } catch (error) {
    return createResponse(false, '保存エラー: ' + error.toString());
  }
}

function saveCustomers(customerData) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName('顧客管理');

    if (!sheet) {
      sheet = ss.insertSheet('顧客管理');
      sheet.appendRow(['ID', '氏名', '電話番号', 'メールアドレス', '購入日', '回数券ID', '残回数', '有効期限', '店舗ID', '登録日時']);
      sheet.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#d4af37').setFontColor('#ffffff');
    }

    const lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 10).clearContent();

    const timestamp = new Date();
    customerData.forEach(customer => {
      sheet.appendRow([
        customer.id, customer.name, customer.phone || '', customer.email || '',
        customer.purchaseDate || '', customer.ticketMasterId || '',
        customer.remainingSessions || 0, customer.expiryDate || '',
        customer.storeId || 0, timestamp
      ]);
    });

    return createResponse(true, '顧客データを保存しました', { rowsAdded: customerData.length });
  } catch (error) {
    return createResponse(false, '保存エラー: ' + error.toString());
  }
}

function saveAllData(data) {
  try {
    const results = { saved: [], errors: [] };

    if (data.staffData && data.staffData.length > 0) {
      try { saveStaffPerformance(data.staffData); results.saved.push({ type: 'スタッフ実績', count: data.staffData.length }); }
      catch (e) { results.errors.push({ type: 'スタッフ実績', error: e.toString() }); }
    }

    if (data.ticketData && data.ticketData.length > 0) {
      try { saveTicketMasters(data.ticketData); results.saved.push({ type: '回数券マスター', count: data.ticketData.length }); }
      catch (e) { results.errors.push({ type: '回数券マスター', error: e.toString() }); }
    }

    if (data.customerData && data.customerData.length > 0) {
      try { saveCustomers(data.customerData); results.saved.push({ type: '顧客管理', count: data.customerData.length }); }
      catch (e) { results.errors.push({ type: '顧客管理', error: e.toString() }); }
    }

    if (data.dailySalesData && data.dailySalesData.length > 0) {
      try { saveDailySales(data.dailySalesData); results.saved.push({ type: '日次売上', count: data.dailySalesData.length }); }
      catch (e) { results.errors.push({ type: '日次売上', error: e.toString() }); }
    }

    if (data.menuSalesData && data.menuSalesData.length > 0) {
      try { saveMenuSales(data.menuSalesData); results.saved.push({ type: 'メニュー別売上', count: data.menuSalesData.length }); }
      catch (e) { results.errors.push({ type: 'メニュー別売上', error: e.toString() }); }
    }

    const message = results.errors.length > 0 ? `一部保存失敗 (成功:${results.saved.length}, 失敗:${results.errors.length})` : `全データ保存完了 (${results.saved.length}件)`;
    return createResponse(results.errors.length === 0, message, results);
  } catch (error) {
    return createResponse(false, '保存エラー: ' + error.toString());
  }
}

// ============================================
// データ取得機能（変更不要）
// ============================================

function getAllData() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const result = { hasData: false, sheets: [] };

    // スタッフデータ取得
    const staffSheet = ss.getSheetByName('スタッフ実績');
    if (staffSheet && staffSheet.getLastRow() > 1) {
      const staffData = staffSheet.getDataRange().getValues();
      result.staff = staffData.slice(1).map(row => ({
        id: row[0], name: row[1], role: row[2], storeId: row[3],
        sales: row[4], target: row[5], nomination: row[7],
        retention: row[8], satisfaction: row[9]
      }));
      result.hasData = true;
      result.sheets.push('スタッフ実績');
    }

    // 回数券マスター取得
    const ticketSheet = ss.getSheetByName('回数券マスター');
    if (ticketSheet && ticketSheet.getLastRow() > 1) {
      const ticketData = ticketSheet.getDataRange().getValues();
      result.ticketMasters = ticketData.slice(1).map(row => ({
        id: row[0], name: row[1], sessions: row[2], price: row[3],
        validMonths: row[4], description: row[5]
      }));
      result.hasData = true;
      result.sheets.push('回数券マスター');
    }

    // 顧客データ取得
    const customerSheet = ss.getSheetByName('顧客管理');
    if (customerSheet && customerSheet.getLastRow() > 1) {
      const customerData = customerSheet.getDataRange().getValues();
      result.customers = customerData.slice(1).map(row => ({
        id: row[0], name: row[1], phone: row[2], email: row[3],
        purchaseDate: row[4], ticketMasterId: row[5],
        remainingSessions: row[6], expiryDate: row[7], storeId: row[8]
      }));
      result.hasData = true;
      result.sheets.push('顧客管理');
    }

    // 日次売上データ取得
    const salesSheet = ss.getSheetByName('日次売上');
    if (salesSheet && salesSheet.getLastRow() > 1) {
      const salesData = salesSheet.getDataRange().getValues();
      result.dailySales = salesData.slice(1).map(row => ({
        date: row[0], storeId: row[1], storeName: row[2],
        spotSales: row[3], ticketSales: row[4], ticketUsage: row[5],
        product: row[6], accountingSales: row[7], cashIn: row[8]
      }));
      result.hasData = true;
      result.sheets.push('日次売上');
    }

    // メニュー別売上取得
    const menuSheet = ss.getSheetByName('メニュー別売上');
    if (menuSheet && menuSheet.getLastRow() > 1) {
      const menuData = menuSheet.getDataRange().getValues();
      result.menuSales = menuData.slice(1).map(row => ({
        menuId: row[0], menuName: row[1], count: row[2], sales: row[3],
        availableStores: row[4] === '両店舗' ? [1, 2] : [2]
      }));
      result.hasData = true;
      result.sheets.push('メニュー別売上');
    }

    if (!result.hasData) {
      return createResponse(false, 'データが見つかりません', result);
    }

    return createResponse(true, 'データを取得しました', result);
  } catch (error) {
    return createResponse(false, '取得エラー: ' + error.toString());
  }
}

// ============================================
// 管理機能（オプション）
// ============================================

function setupSpreadsheet() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheetNames = ['日次売上', 'メニュー別売上', 'スタッフ実績', '回数券マスター', '顧客管理'];
    const created = [];

    sheetNames.forEach(name => {
      if (!ss.getSheetByName(name)) {
        ss.insertSheet(name);
        created.push(name);
      }
    });

    Logger.log('設定完了: ' + created.length + '件作成');
    return '完了';
  } catch (error) {
    Logger.log('エラー: ' + error.toString());
    return 'エラー';
  }
}
```

### 2-3. スプレッドシートIDを設定

コードの**7行目**を見つけて、先ほどコピーしたスプレッドシートIDを貼り付けます：

```javascript
// 変更前
const SPREADSHEET_ID = 'ここにスプレッドシートIDを貼り付け';

// 変更後（例）
const SPREADSHEET_ID = '1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t';
```

### 2-4. 保存

- 左上の💾アイコンをクリック、または`Ctrl+S`（Mac: `Cmd+S`）
- プロジェクト名を聞かれたら「エステサロンAPI」と入力

---

## ステップ3: デプロイ

### 3-1. デプロイを開始

1. 右上の「デプロイ」ボタンをクリック
2. 「新しいデプロイ」を選択

### 3-2. デプロイの設定

1. 左側の⚙（歯車アイコン）をクリック
2. 「ウェブアプリ」を選択
3. 以下のように設定:
   - **説明**: （空欄でOK）
   - **次のユーザーとして実行**: 「自分」
   - **アクセスできるユーザー**: 「**全員**」← **重要！**

### 3-3. 承認（初回のみ）

1. 「デプロイ」をクリック
2. 「アクセスを承認」をクリック
3. Googleアカウントを選択
4. 「このアプリはGoogleで確認されていません」と表示されたら:
   - 左下の「**詳細**」をクリック
   - 「（プロジェクト名）（安全ではないページ）に移動」をクリック
5. 「許可」をクリック

### 3-4. URLをコピー

デプロイが完了すると、「ウェブアプリ」のURLが表示されます。

```
https://script.google.com/macros/s/AKfycby.../exec
```

**📋 このURLをコピーして、メモ帳に保存してください**

---

## ステップ4: index.html を更新

### 4-1. index.htmlをテキストエディタで開く

### 4-2. GAS URLを設定

**929行目付近**を探して、先ほどコピーしたURLを貼り付けます：

```javascript
// 変更前
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxmSKXpHDEVbHeKEIHrtk_DoQfXIsMXBExfa7CzhpkizuC_wf-UY5YqXn0Ctc4u6lbq/exec';

// 変更後（あなたのURLに置き換え）
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/【あなたのURL】/exec';
```

### 4-3. 保存

`Ctrl+S`（Mac: `Cmd+S`）で保存

---

## ✅ 完了！動作確認

### 確認1: ダッシュボードを開く

1. index.htmlをブラウザで開く
2. ダッシュボードが表示されることを確認

### 確認2: データを保存

1. 右上の「**保存**」ボタンをクリック
2. 「✓ データをスプレッドシートに保存しました」と表示されるか確認

### 確認3: スプレッドシートを確認

1. スプレッドシートを開く
2. 以下のシートが自動作成されているか確認:
   - 日次売上
   - メニュー別売上
   - スタッフ実績
   - 回数券マスター
   - 顧客管理

### 確認4: データを読み込む

1. 右上の「**読み込み**」ボタンをクリック
2. スプレッドシートからデータが読み込まれるか確認

---

## 🆘 トラブルシューティング

### ❌ 「保存」ボタンを押しても反応しない

**原因:** デプロイ設定が正しくない

**解決策:**
1. Apps Scriptに戻る
2. 「デプロイ」→「デプロイを管理」
3. 編集アイコン（鉛筆マーク）をクリック
4. 「アクセスできるユーザー」が「**全員**」になっているか確認
5. なっていなければ変更して「デプロイを更新」

### ❌ 「Spreadsheet not found」エラー

**原因:** SPREADSHEET_IDが間違っている

**解決策:**
1. スプレッドシートのURLを再確認
2. `/d/`と`/edit`の間の部分を正しくコピー
3. Apps ScriptのコードのSPREADSHEET_IDを修正
4. 保存

### ❌ 「スプレッドシートURLが設定されていません」エラー

**原因:** index.htmlのGAS_WEB_APP_URLが間違っている

**解決策:**
1. Apps Scriptで「デプロイ」→「デプロイを管理」
2. ウェブアプリのURLを再度コピー
3. index.htmlの929行目に正しく貼り付け
4. 保存してブラウザをリロード

### ❌ 白い画面が表示される

**原因:** ブラウザのキャッシュ

**解決策:**
1. `Ctrl+Shift+R`（Mac: `Cmd+Shift+R`）でスーパーリロード
2. または`F12`でコンソールを開いてエラーを確認

---

## 📦 スプレッドシートのシート構造（参考）

GASが自動的にシートを作成しますが、参考として構造を記載します。

### 日次売上
```
日付 | 店舗ID | 店舗名 | 都度払い | 回数券販売 | 回数券消化 | 物販 | 会計上売上 | キャッシュイン | 登録日時
```

### メニュー別売上
```
メニューID | メニュー名 | 回数 | 売上 | 対応店舗 | 登録日時
```

### スタッフ実績
```
スタッフID | スタッフ名 | 役職 | 店舗ID | 売上実績 | 売上目標 | 達成率(%) | 指名数 | リピート率(%) | 満足度 | 登録日時
```

### 回数券マスター
```
ID | 回数券名 | 回数 | 価格 | 有効期限(月) | 説明 | 登録日時
```

### 顧客管理
```
ID | 氏名 | 電話番号 | メールアドレス | 購入日 | 回数券ID | 残回数 | 有効期限 | 店舗ID | 登録日時
```

---

## 🎉 完了！

これでスプレッドシートとGASの設定が完了しました。

**次のステップ:**
- ダッシュボードでデータを入力
- 「保存」ボタンでスプレッドシートに保存
- 「読み込み」ボタンで他のデバイスからもアクセス可能

**質問や問題があれば、エラーメッセージを共有してください。**
