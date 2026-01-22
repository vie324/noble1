/**
 * エステサロン経営ダッシュボード - Google Apps Script
 * スプレッドシートへのデータ保存とAPI機能
 */

// スプレッドシートID（デプロイ時に実際のIDに変更してください）
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';

/**
 * Webアプリケーションとして公開するためのGET/POSTハンドラー
 */
function doGet(e) {
  return HtmlService.createHtmlOutput(JSON.stringify({
    status: 'ok',
    message: 'エステサロンダッシュボードAPI'
  }));
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    switch(action) {
      case 'saveDailySales':
        return saveDailySales(data.salesData);
      case 'saveMenuSales':
        return saveMenuSales(data.menuData);
      case 'saveStaffPerformance':
        return saveStaffPerformance(data.staffData);
      case 'getDailySales':
        return getDailySales(data.startDate, data.endDate);
      default:
        return createResponse(false, 'Unknown action');
    }
  } catch (error) {
    return createResponse(false, error.toString());
  }
}

/**
 * レスポンスを作成
 */
function createResponse(success, message, data = null) {
  const response = {
    success: success,
    message: message,
    data: data
  };
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 日次売上データをスプレッドシートに保存
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
        '回数券消化', '物販', '会計上売上', 'キャッシュイン',
        '登録日時'
      ]);
    }

    // データを追加
    salesData.forEach(dayData => {
      const timestamp = new Date();

      // 全店舗合計
      sheet.appendRow([
        dayData.day,
        '0',
        '全店舗合計',
        dayData.spotSales,
        dayData.ticketSales,
        dayData.ticketUsage,
        dayData.product,
        dayData.accountingSales,
        dayData.cashIn,
        timestamp
      ]);

      // 店舗別データ
      if (dayData.storeData) {
        dayData.storeData.forEach(store => {
          sheet.appendRow([
            dayData.day,
            store.storeId,
            store.storeName,
            store.spotSales,
            store.ticketSales,
            store.ticketUsage,
            store.product,
            store.accountingSales,
            store.cashIn,
            timestamp
          ]);
        });
      }
    });

    return createResponse(true, '日次売上データを保存しました', { rowsAdded: salesData.length });
  } catch (error) {
    return createResponse(false, '保存エラー: ' + error.toString());
  }
}

/**
 * メニュー別売上データをスプレッドシートに保存
 */
function saveMenuSales(menuData) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName('メニュー別売上');

    // シートが存在しない場合は作成
    if (!sheet) {
      sheet = ss.insertSheet('メニュー別売上');
      sheet.appendRow([
        'メニューID', 'メニュー名', '回数', '売上',
        '対応店舗', '登録日時'
      ]);
    }

    // データを追加
    const timestamp = new Date();
    menuData.forEach(menu => {
      const storesText = menu.availableStores.length === 2 ? '両店舗' : '新宿南口店のみ';
      sheet.appendRow([
        menu.menuId,
        menu.menuName,
        menu.count,
        menu.sales,
        storesText,
        timestamp
      ]);
    });

    return createResponse(true, 'メニュー別売上データを保存しました', { rowsAdded: menuData.length });
  } catch (error) {
    return createResponse(false, '保存エラー: ' + error.toString());
  }
}

/**
 * スタッフパフォーマンスデータをスプレッドシートに保存
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
    }

    // データを追加
    const timestamp = new Date();
    staffData.forEach(staff => {
      const achievementRate = Math.round((staff.sales / staff.target) * 100);
      sheet.appendRow([
        staff.id,
        staff.name,
        staff.role,
        staff.storeId,
        staff.sales,
        staff.target,
        achievementRate,
        staff.nomination,
        staff.retention,
        staff.satisfaction,
        timestamp
      ]);
    });

    return createResponse(true, 'スタッフ実績データを保存しました', { rowsAdded: staffData.length });
  } catch (error) {
    return createResponse(false, '保存エラー: ' + error.toString());
  }
}

/**
 * 日次売上データを取得
 */
function getDailySales(startDate, endDate) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('日次売上');

    if (!sheet) {
      return createResponse(false, 'データが見つかりません');
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows = data.slice(1);

    // 日付でフィルタリング（簡易実装）
    const filteredRows = rows.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });

    return createResponse(true, 'データを取得しました', filteredRows);
  } catch (error) {
    return createResponse(false, '取得エラー: ' + error.toString());
  }
}

/**
 * スプレッドシートの初期設定（初回のみ実行）
 */
function setupSpreadsheet() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // 既存のシートがあれば削除しない（データ保護）
    const sheetNames = ['日次売上', 'メニュー別売上', 'スタッフ実績', '媒体別データ'];

    sheetNames.forEach(sheetName => {
      if (!ss.getSheetByName(sheetName)) {
        ss.insertSheet(sheetName);
        Logger.log(sheetName + ' シートを作成しました');
      }
    });

    Logger.log('スプレッドシートの初期設定が完了しました');
    return '設定完了';
  } catch (error) {
    Logger.log('エラー: ' + error.toString());
    return 'エラー: ' + error.toString();
  }
}

/**
 * テストデータを生成してスプレッドシートに保存
 */
function generateTestData() {
  // テスト用の日次売上データ
  const testSalesData = [
    {
      day: '1日',
      spotSales: 45000,
      ticketSales: 150000,
      ticketUsage: 55000,
      product: 12000,
      accountingSales: 112000,
      cashIn: 207000,
      storeData: [
        { storeId: 1, storeName: '新宿店', spotSales: 25000, ticketSales: 100000, ticketUsage: 30000, product: 7000, accountingSales: 62000, cashIn: 132000 },
        { storeId: 2, storeName: '新宿南口店', spotSales: 20000, ticketSales: 50000, ticketUsage: 25000, product: 5000, accountingSales: 50000, cashIn: 75000 }
      ]
    }
  ];

  saveDailySales(testSalesData);
  Logger.log('テストデータを生成しました');
}
