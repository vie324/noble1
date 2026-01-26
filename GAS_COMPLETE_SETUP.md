# Google Apps Script (GAS) 完全設定ガイド

このドキュメントには、エステサロンダッシュボードのGAS設定とスプレッドシート形式のすべてが含まれています。

---

## 📋 目次

1. [スプレッドシートのシート構成](#スプレッドシートのシート構成)
2. [完全なGASコード](#完全なGASコード)
3. [セットアップ手順](#セットアップ手順)
4. [テストデータの投入](#テストデータの投入)
5. [トラブルシューティング](#トラブルシューティング)

---

## スプレッドシートのシート構成

ダッシュボードは以下の5つのシートを使用します。GASが自動的に作成しますが、手動で作成する場合は以下の形式に従ってください。

### 1. 日次売上シート

**シート名:** `日次売上`

| 列名 | データ型 | 説明 | 例 |
|------|----------|------|-----|
| 日付 | 文字列/日付 | YYYY-MM-DD形式 | 2026-01-15 |
| 店舗ID | 数値 | 0=全店舗, 1=新宿店, 2=新宿南口店 | 1 |
| 店舗名 | 文字列 | 店舗の名前 | 新宿店 |
| 都度払い | 数値 | 都度払いの売上 | 120000 |
| 回数券販売 | 数値 | 回数券の販売額 | 85000 |
| 回数券消化 | 数値 | 回数券の消化額 | 54000 |
| 物販 | 数値 | 物販の売上 | 28000 |
| 会計上売上 | 数値 | 会計上の売上（PL） | 287000 |
| キャッシュイン | 数値 | 実際の入金額 | 233000 |
| 登録日時 | 日時 | データ登録日時 | 2026-01-20 10:30:00 |

**サンプルデータ:**
```
日付,店舗ID,店舗名,都度払い,回数券販売,回数券消化,物販,会計上売上,キャッシュイン,登録日時
2026-01-15,1,新宿店,120000,85000,54000,28000,202000,233000,2026-01-20 10:30:00
2026-01-15,2,新宿南口店,80000,50000,40000,15000,135000,145000,2026-01-20 10:30:00
```

---

### 2. メニュー別売上シート

**シート名:** `メニュー別売上`

| 列名 | データ型 | 説明 | 例 |
|------|----------|------|-----|
| メニューID | 数値 | メニューの一意ID | 1 |
| メニュー名 | 文字列 | メニューの名称 | 剥離ありハーブピーリング(顔) |
| 回数 | 数値 | 施術回数 | 45 |
| 売上 | 数値 | 売上金額 | 562500 |
| 対応店舗 | 文字列 | 両店舗 or 新宿南口店のみ | 両店舗 |
| 登録日時 | 日時 | データ登録日時 | 2026-01-20 10:30:00 |

**サンプルデータ:**
```
メニューID,メニュー名,回数,売上,対応店舗,登録日時
1,剥離ありハーブピーリング(顔),45,562500,両店舗,2026-01-20 10:30:00
2,剥離なしハーブピーリング(顔),32,256000,両店舗,2026-01-20 10:30:00
```

---

### 3. スタッフ実績シート

**シート名:** `スタッフ実績`

| 列名 | データ型 | 説明 | 例 |
|------|----------|------|-----|
| スタッフID | 数値 | スタッフの一意ID | 1 |
| スタッフ名 | 文字列 | スタッフの名前 | 佐藤美咲 |
| 役職 | 文字列 | 役職名 | 店長 |
| 店舗ID | 数値 | 1=新宿店, 2=新宿南口店 | 1 |
| 売上実績 | 数値 | 売上実績金額 | 2850000 |
| 売上目標 | 数値 | 売上目標金額 | 3000000 |
| 達成率(%) | 数値 | 達成率パーセント | 95 |
| 指名数 | 数値 | 指名された回数 | 45 |
| リピート率(%) | 数値 | リピート率パーセント | 85 |
| 満足度 | 数値 | 顧客満足度スコア | 4.8 |
| 登録日時 | 日時 | データ登録日時 | 2026-01-20 10:30:00 |

**サンプルデータ:**
```
スタッフID,スタッフ名,役職,店舗ID,売上実績,売上目標,達成率(%),指名数,リピート率(%),満足度,登録日時
1,佐藤美咲,店長,1,2850000,3000000,95,45,85,4.8,2026-01-20 10:30:00
2,田中愛,副店長,1,2450000,2500000,98,38,88,4.7,2026-01-20 10:30:00
```

---

### 4. 回数券マスターシート

**シート名:** `回数券マスター`

| 列名 | データ型 | 説明 | 例 |
|------|----------|------|-----|
| ID | 数値 | 回数券の一意ID | 1 |
| 回数券名 | 文字列 | 回数券の名称 | ハーブピーリング5回券 |
| 回数 | 数値 | 施術回数 | 5 |
| 価格 | 数値 | 販売価格 | 50000 |
| 有効期限(月) | 数値 | 有効期限（月数） | 6 |
| 説明 | 文字列 | 回数券の説明 | お得な5回セット |
| 登録日時 | 日時 | データ登録日時 | 2026-01-20 10:30:00 |

**サンプルデータ:**
```
ID,回数券名,回数,価格,有効期限(月),説明,登録日時
1,ハーブピーリング5回券,5,50000,6,お得な5回セット,2026-01-20 10:30:00
2,ハーブピーリング10回券,10,95000,12,人気の10回コース,2026-01-20 10:30:00
```

---

### 5. 顧客管理シート

**シート名:** `顧客管理`

| 列名 | データ型 | 説明 | 例 |
|------|----------|------|-----|
| ID | 数値 | 顧客の一意ID | 1 |
| 氏名 | 文字列 | 顧客の名前 | 山田花子 |
| 電話番号 | 文字列 | 電話番号 | 090-1234-5678 |
| メールアドレス | 文字列 | メールアドレス | yamada@example.com |
| 購入日 | 文字列/日付 | 回数券購入日 | 2026-01-10 |
| 回数券ID | 数値 | 購入した回数券のID | 1 |
| 残回数 | 数値 | 残りの施術回数 | 3 |
| 有効期限 | 文字列/日付 | 回数券の有効期限 | 2026-07-10 |
| 店舗ID | 数値 | 1=新宿店, 2=新宿南口店 | 1 |
| 登録日時 | 日時 | データ登録日時 | 2026-01-20 10:30:00 |

**サンプルデータ:**
```
ID,氏名,電話番号,メールアドレス,購入日,回数券ID,残回数,有効期限,店舗ID,登録日時
1,山田花子,090-1234-5678,yamada@example.com,2026-01-10,1,3,2026-07-10,1,2026-01-20 10:30:00
2,鈴木真美,080-9876-5432,suzuki@example.com,2026-01-12,2,8,2027-01-12,2,2026-01-20 10:30:00
```

---

## 完全なGASコード

以下のコードを**すべて**コピーして、Apps Scriptエディタに貼り付けてください。

```javascript
/**
 * エステサロン経営ダッシュボード - Google Apps Script (完全版)
 * スプレッドシートへのデータ保存とAPI機能
 *
 * バージョン: 2.0
 * 最終更新: 2026-01-26
 */

// ============================================
// 【重要】ここにスプレッドシートIDを設定してください
// ============================================
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';

// スプレッドシートIDの取得方法:
// 1. スプレッドシートを開く
// 2. URLを確認: https://docs.google.com/spreadsheets/d/【ここがID】/edit
// 3. /d/ と /edit の間の文字列をコピーして、上の行に貼り付ける
// 例: const SPREADSHEET_ID = '1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t';

// ============================================
// メインハンドラー
// ============================================

/**
 * GETリクエストのハンドラー
 */
function doGet(e) {
  try {
    const action = e.parameter.action;

    if (action === 'getAllData') {
      return getAllData();
    }

    // デフォルトレスポンス
    return createResponse(true, 'エステサロンダッシュボードAPI v2.0', {
      endpoints: {
        GET: ['getAllData'],
        POST: ['saveAllData', 'saveDailySales', 'saveMenuSales', 'saveStaffPerformance', 'saveTicketMasters', 'saveCustomers']
      }
    });
  } catch (error) {
    Logger.log('doGet エラー: ' + error.toString());
    return createResponse(false, 'エラー: ' + error.toString());
  }
}

/**
 * POSTリクエストのハンドラー
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    Logger.log('POST アクション: ' + action);

    switch(action) {
      case 'saveDailySales':
        return saveDailySales(data.salesData);
      case 'saveMenuSales':
        return saveMenuSales(data.menuData);
      case 'saveStaffPerformance':
        return saveStaffPerformance(data.staffData);
      case 'saveTicketMasters':
        return saveTicketMasters(data.ticketData);
      case 'saveCustomers':
        return saveCustomers(data.customerData);
      case 'saveAllData':
        return saveAllData(data);
      case 'getAllData':
        return getAllData();
      default:
        return createResponse(false, '不明なアクション: ' + action);
    }
  } catch (error) {
    Logger.log('doPost エラー: ' + error.toString());
    return createResponse(false, 'エラー: ' + error.toString());
  }
}

// ============================================
// レスポンス作成
// ============================================

/**
 * JSON レスポンスを作成
 */
function createResponse(success, message, data = null) {
  const response = {
    success: success,
    message: message,
    timestamp: new Date().toISOString()
  };

  if (data !== null) {
    response.data = data;
  }

  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// データ保存機能
// ============================================

/**
 * 日次売上データを保存
 */
function saveDailySales(salesData) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName('日次売上');

    // シートが存在しない場合は作成
    if (!sheet) {
      sheet = ss.insertSheet('日次売上');
      // ヘッダー行を追加
      sheet.appendRow([
        '日付', '店舗ID', '店舗名', '都度払い', '回数券販売',
        '回数券消化', '物販', '会計上売上', 'キャッシュイン', '登録日時'
      ]);
      // ヘッダーを装飾
      const headerRange = sheet.getRange(1, 1, 1, 10);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#d4af37');
      headerRange.setFontColor('#ffffff');
    }

    // データを追加
    const timestamp = new Date();
    let rowsAdded = 0;

    salesData.forEach(entry => {
      // 日次売上データを保存
      sheet.appendRow([
        entry.date || '',
        entry.storeId || 0,
        entry.storeName || '',
        entry.spotSales || 0,
        entry.ticketSales || 0,
        entry.ticketUsage || 0,
        entry.product || 0,
        entry.accountingSales || 0,
        entry.cashIn || 0,
        timestamp
      ]);
      rowsAdded++;
    });

    return createResponse(true, '日次売上データを保存しました', {
      rowsAdded: rowsAdded,
      sheetName: '日次売上'
    });
  } catch (error) {
    Logger.log('saveDailySales エラー: ' + error.toString());
    return createResponse(false, '保存エラー: ' + error.toString());
  }
}

/**
 * メニュー別売上データを保存
 */
function saveMenuSales(menuData) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName('メニュー別売上');

    // シートが存在しない場合は作成
    if (!sheet) {
      sheet = ss.insertSheet('メニュー別売上');
      sheet.appendRow([
        'メニューID', 'メニュー名', '回数', '売上', '対応店舗', '登録日時'
      ]);
      const headerRange = sheet.getRange(1, 1, 1, 6);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#d4af37');
      headerRange.setFontColor('#ffffff');
    }

    // 既存データをクリア（ヘッダーは残す）
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, 6).clearContent();
    }

    // データを追加
    const timestamp = new Date();
    menuData.forEach(menu => {
      const storesText = menu.availableStores && menu.availableStores.length === 2 ? '両店舗' : '新宿南口店のみ';
      sheet.appendRow([
        menu.menuId,
        menu.menuName,
        menu.count || 0,
        menu.sales || 0,
        storesText,
        timestamp
      ]);
    });

    return createResponse(true, 'メニュー別売上データを保存しました', {
      rowsAdded: menuData.length,
      sheetName: 'メニュー別売上'
    });
  } catch (error) {
    Logger.log('saveMenuSales エラー: ' + error.toString());
    return createResponse(false, '保存エラー: ' + error.toString());
  }
}

/**
 * スタッフパフォーマンスデータを保存
 */
function saveStaffPerformance(staffData) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName('スタッフ実績');

    // シートが存在しない場合は作成
    if (!sheet) {
      sheet = ss.insertSheet('スタッフ実績');
      sheet.appendRow([
        'スタッフID', 'スタッフ名', '役職', '店舗ID',
        '売上実績', '売上目標', '達成率(%)', '指名数',
        'リピート率(%)', '満足度', '登録日時'
      ]);
      const headerRange = sheet.getRange(1, 1, 1, 11);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#d4af37');
      headerRange.setFontColor('#ffffff');
    }

    // 既存データをクリア
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, 11).clearContent();
    }

    // データを追加
    const timestamp = new Date();
    staffData.forEach(staff => {
      const achievementRate = staff.target > 0 ? Math.round((staff.sales / staff.target) * 100) : 0;
      sheet.appendRow([
        staff.id,
        staff.name,
        staff.role || '',
        staff.storeId,
        staff.sales || 0,
        staff.target || 0,
        achievementRate,
        staff.nomination || 0,
        staff.retention || 0,
        staff.satisfaction || 0,
        timestamp
      ]);
    });

    return createResponse(true, 'スタッフ実績データを保存しました', {
      rowsAdded: staffData.length,
      sheetName: 'スタッフ実績'
    });
  } catch (error) {
    Logger.log('saveStaffPerformance エラー: ' + error.toString());
    return createResponse(false, '保存エラー: ' + error.toString());
  }
}

/**
 * 回数券マスターデータを保存
 */
function saveTicketMasters(ticketData) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName('回数券マスター');

    if (!sheet) {
      sheet = ss.insertSheet('回数券マスター');
      sheet.appendRow(['ID', '回数券名', '回数', '価格', '有効期限(月)', '説明', '登録日時']);
      const headerRange = sheet.getRange(1, 1, 1, 7);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#d4af37');
      headerRange.setFontColor('#ffffff');
    }

    // 既存データをクリア
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, 7).clearContent();
    }

    // 新しいデータを追加
    const timestamp = new Date();
    ticketData.forEach(ticket => {
      sheet.appendRow([
        ticket.id,
        ticket.name,
        ticket.sessions || 0,
        ticket.price || 0,
        ticket.validMonths || 0,
        ticket.description || '',
        timestamp
      ]);
    });

    return createResponse(true, '回数券マスターを保存しました', {
      rowsAdded: ticketData.length,
      sheetName: '回数券マスター'
    });
  } catch (error) {
    Logger.log('saveTicketMasters エラー: ' + error.toString());
    return createResponse(false, '保存エラー: ' + error.toString());
  }
}

/**
 * 顧客データを保存
 */
function saveCustomers(customerData) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName('顧客管理');

    if (!sheet) {
      sheet = ss.insertSheet('顧客管理');
      sheet.appendRow([
        'ID', '氏名', '電話番号', 'メールアドレス', '購入日',
        '回数券ID', '残回数', '有効期限', '店舗ID', '登録日時'
      ]);
      const headerRange = sheet.getRange(1, 1, 1, 10);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#d4af37');
      headerRange.setFontColor('#ffffff');
    }

    // 既存データをクリア
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, 10).clearContent();
    }

    // 新しいデータを追加
    const timestamp = new Date();
    customerData.forEach(customer => {
      sheet.appendRow([
        customer.id,
        customer.name,
        customer.phone || '',
        customer.email || '',
        customer.purchaseDate || '',
        customer.ticketMasterId || '',
        customer.remainingSessions || 0,
        customer.expiryDate || '',
        customer.storeId || 0,
        timestamp
      ]);
    });

    return createResponse(true, '顧客データを保存しました', {
      rowsAdded: customerData.length,
      sheetName: '顧客管理'
    });
  } catch (error) {
    Logger.log('saveCustomers エラー: ' + error.toString());
    return createResponse(false, '保存エラー: ' + error.toString());
  }
}

/**
 * 全データを一括保存
 */
function saveAllData(data) {
  try {
    const results = {
      saved: [],
      errors: []
    };

    // スタッフデータ
    if (data.staffData && data.staffData.length > 0) {
      try {
        saveStaffPerformance(data.staffData);
        results.saved.push({ type: 'スタッフ実績', count: data.staffData.length });
      } catch (e) {
        results.errors.push({ type: 'スタッフ実績', error: e.toString() });
      }
    }

    // 回数券マスター
    if (data.ticketData && data.ticketData.length > 0) {
      try {
        saveTicketMasters(data.ticketData);
        results.saved.push({ type: '回数券マスター', count: data.ticketData.length });
      } catch (e) {
        results.errors.push({ type: '回数券マスター', error: e.toString() });
      }
    }

    // 顧客データ
    if (data.customerData && data.customerData.length > 0) {
      try {
        saveCustomers(data.customerData);
        results.saved.push({ type: '顧客管理', count: data.customerData.length });
      } catch (e) {
        results.errors.push({ type: '顧客管理', error: e.toString() });
      }
    }

    // 日次売上データ
    if (data.dailySalesData && data.dailySalesData.length > 0) {
      try {
        saveDailySales(data.dailySalesData);
        results.saved.push({ type: '日次売上', count: data.dailySalesData.length });
      } catch (e) {
        results.errors.push({ type: '日次売上', error: e.toString() });
      }
    }

    // メニュー別売上
    if (data.menuSalesData && data.menuSalesData.length > 0) {
      try {
        saveMenuSales(data.menuSalesData);
        results.saved.push({ type: 'メニュー別売上', count: data.menuSalesData.length });
      } catch (e) {
        results.errors.push({ type: 'メニュー別売上', error: e.toString() });
      }
    }

    const message = results.errors.length > 0
      ? `一部保存に失敗しました (${results.saved.length}件成功, ${results.errors.length}件失敗)`
      : `全データを保存しました (${results.saved.length}件)`;

    return createResponse(results.errors.length === 0, message, results);
  } catch (error) {
    Logger.log('saveAllData エラー: ' + error.toString());
    return createResponse(false, '保存エラー: ' + error.toString());
  }
}

// ============================================
// データ取得機能
// ============================================

/**
 * 全データを取得
 */
function getAllData() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const result = {
      hasData: false,
      sheets: []
    };

    // スタッフデータ取得
    const staffSheet = ss.getSheetByName('スタッフ実績');
    if (staffSheet && staffSheet.getLastRow() > 1) {
      const staffData = staffSheet.getDataRange().getValues();
      result.staff = staffData.slice(1).map(row => ({
        id: row[0],
        name: row[1],
        role: row[2],
        storeId: row[3],
        sales: row[4],
        target: row[5],
        nomination: row[7],
        retention: row[8],
        satisfaction: row[9]
      }));
      result.hasData = true;
      result.sheets.push('スタッフ実績');
    }

    // 回数券マスター取得
    const ticketSheet = ss.getSheetByName('回数券マスター');
    if (ticketSheet && ticketSheet.getLastRow() > 1) {
      const ticketData = ticketSheet.getDataRange().getValues();
      result.ticketMasters = ticketData.slice(1).map(row => ({
        id: row[0],
        name: row[1],
        sessions: row[2],
        price: row[3],
        validMonths: row[4],
        description: row[5]
      }));
      result.hasData = true;
      result.sheets.push('回数券マスター');
    }

    // 顧客データ取得
    const customerSheet = ss.getSheetByName('顧客管理');
    if (customerSheet && customerSheet.getLastRow() > 1) {
      const customerData = customerSheet.getDataRange().getValues();
      result.customers = customerData.slice(1).map(row => ({
        id: row[0],
        name: row[1],
        phone: row[2],
        email: row[3],
        purchaseDate: row[4],
        ticketMasterId: row[5],
        remainingSessions: row[6],
        expiryDate: row[7],
        storeId: row[8]
      }));
      result.hasData = true;
      result.sheets.push('顧客管理');
    }

    // 日次売上データ取得
    const salesSheet = ss.getSheetByName('日次売上');
    if (salesSheet && salesSheet.getLastRow() > 1) {
      const salesData = salesSheet.getDataRange().getValues();
      result.dailySales = salesData.slice(1).map(row => ({
        date: row[0],
        storeId: row[1],
        storeName: row[2],
        spotSales: row[3],
        ticketSales: row[4],
        ticketUsage: row[5],
        product: row[6],
        accountingSales: row[7],
        cashIn: row[8]
      }));
      result.hasData = true;
      result.sheets.push('日次売上');
    }

    // メニュー別売上取得
    const menuSheet = ss.getSheetByName('メニュー別売上');
    if (menuSheet && menuSheet.getLastRow() > 1) {
      const menuData = menuSheet.getDataRange().getValues();
      result.menuSales = menuData.slice(1).map(row => ({
        menuId: row[0],
        menuName: row[1],
        count: row[2],
        sales: row[3],
        availableStores: row[4] === '両店舗' ? [1, 2] : [2]
      }));
      result.hasData = true;
      result.sheets.push('メニュー別売上');
    }

    if (!result.hasData) {
      return createResponse(false, 'スプレッドシートにデータが見つかりません', result);
    }

    return createResponse(true, 'データを取得しました', result);
  } catch (error) {
    Logger.log('getAllData エラー: ' + error.toString());
    return createResponse(false, '取得エラー: ' + error.toString());
  }
}

// ============================================
// 管理機能
// ============================================

/**
 * スプレッドシートの初期設定
 *
 * 使用方法:
 * 1. Apps Scriptエディタでこの関数を選択
 * 2. 「実行」ボタンをクリック
 * 3. すべてのシートが作成されます
 */
function setupSpreadsheet() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheetNames = ['日次売上', 'メニュー別売上', 'スタッフ実績', '回数券マスター', '顧客管理'];
    const created = [];
    const existing = [];

    sheetNames.forEach(sheetName => {
      if (!ss.getSheetByName(sheetName)) {
        ss.insertSheet(sheetName);
        created.push(sheetName);
        Logger.log(sheetName + ' シートを作成しました');
      } else {
        existing.push(sheetName);
        Logger.log(sheetName + ' シートは既に存在します');
      }
    });

    const message = `設定完了: 作成 ${created.length}件, 既存 ${existing.length}件`;
    Logger.log(message);
    return message;
  } catch (error) {
    const errorMsg = 'エラー: ' + error.toString();
    Logger.log(errorMsg);
    return errorMsg;
  }
}

/**
 * テストデータを生成
 *
 * 使用方法:
 * 1. Apps Scriptエディタでこの関数を選択
 * 2. 「実行」ボタンをクリック
 * 3. サンプルデータが各シートに追加されます
 */
function generateTestData() {
  try {
    // 日次売上のテストデータ
    const testDailySales = [
      {
        date: '2026-01-15',
        storeId: 1,
        storeName: '新宿店',
        spotSales: 120000,
        ticketSales: 85000,
        ticketUsage: 54000,
        product: 28000,
        accountingSales: 202000,
        cashIn: 233000
      },
      {
        date: '2026-01-15',
        storeId: 2,
        storeName: '新宿南口店',
        spotSales: 80000,
        ticketSales: 50000,
        ticketUsage: 40000,
        product: 15000,
        accountingSales: 135000,
        cashIn: 145000
      }
    ];

    saveDailySales(testDailySales);
    Logger.log('テストデータを生成しました');
    return '完了';
  } catch (error) {
    Logger.log('エラー: ' + error.toString());
    return 'エラー: ' + error.toString();
  }
}
```

---

## セットアップ手順

### ステップ1: スプレッドシートを作成

1. Google Driveで新しいスプレッドシートを作成
2. 名前を付ける（例: エステサロンデータ）
3. URLからスプレッドシートIDをコピー
   - URL: `https://docs.google.com/spreadsheets/d/【ここ】/edit`

### ステップ2: Apps Scriptを設定

1. スプレッドシートで「拡張機能」→「Apps Script」
2. 既存のコードを削除
3. 上記の「完全なGASコード」をすべてコピー&ペースト
4. **7行目の`SPREADSHEET_ID`を変更**
   ```javascript
   const SPREADSHEET_ID = 'あなたのスプレッドシートID';
   ```
5. 保存（💾アイコン）

### ステップ3: 初期設定を実行（オプション）

Apps Scriptエディタで:

1. 関数選択ドロップダウンから`setupSpreadsheet`を選択
2. 「実行」ボタンをクリック
3. 承認を求められたら許可
4. すべてのシートが自動作成されます

### ステップ4: ウェブアプリとしてデプロイ

1. 「デプロイ」→「新しいデプロイ」
2. 「種類の選択」→「ウェブアプリ」
3. 設定:
   - **次のユーザーとして実行**: 自分
   - **アクセスできるユーザー**: **全員**（重要！）
4. 「デプロイ」をクリック
5. **ウェブアプリのURLをコピー**

### ステップ5: index.htmlを更新

index.htmlの929行目を編集:

```javascript
const GAS_WEB_APP_URL = 'コピーしたウェブアプリのURL';
```

---

## テストデータの投入

### 方法1: Apps Scriptから直接投入

1. Apps Scriptエディタで関数選択から`generateTestData`を選択
2. 「実行」ボタンをクリック
3. サンプルデータが投入されます

### 方法2: ダッシュボードから保存

1. index.htmlをブラウザで開く
2. データを入力
3. 右上の「保存」ボタンをクリック

---

## トラブルシューティング

### ❌ 「Spreadsheet not found」エラー

**原因:** SPREADSHEET_IDが間違っている

**解決策:**
1. スプレッドシートのURLを再確認
2. IDを正しくコピー（余分なスペースに注意）
3. Code.gsを保存し直す

### ❌ 「権限がありません」エラー

**原因:** デプロイ設定が正しくない

**解決策:**
1. 「デプロイ」→「デプロイを管理」
2. 編集アイコン（鉛筆）をクリック
3. 「アクセスできるユーザー」を「全員」に変更
4. 「デプロイを更新」をクリック

### ❌ データが保存されない

**原因:** GAS_WEB_APP_URLが設定されていない

**解決策:**
1. index.htmlの929行目を確認
2. デプロイしたウェブアプリのURLを貼り付け
3. 保存してブラウザをリロード

### ❌ データが読み込めない

**原因:** スプレッドシートが空

**解決策:**
1. 先に「保存」ボタンでデータを保存
2. または`generateTestData`関数でテストデータを投入
3. その後「読み込み」ボタンをクリック

---

## 完了！

設定が完了したら、ダッシュボードでデータの保存・読み込みができるようになります。

**動作確認:**
1. index.htmlを開く
2. 「保存」ボタンをクリック
3. スプレッドシートにデータが保存されることを確認
4. 「読み込み」ボタンをクリック
5. データが読み込まれることを確認
