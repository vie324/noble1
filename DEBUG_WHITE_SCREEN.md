# 白い画面のデバッグガイド

真っ白な画面が表示される問題のデバッグ手順をまとめました。

---

## 🔍 問題の特定方法

### ステップ1: ブラウザのコンソールを確認

1. **ブラウザでindex.htmlを開く**

2. **デベロッパーツールを開く**
   - Windows/Linux: `F12` または `Ctrl+Shift+I`
   - Mac: `Cmd+Option+I`

3. **「Console」タブを選択**

4. **エラーメッセージを確認**
   - 赤いエラーメッセージが表示されているか確認
   - エラーがあれば、その内容をコピー

**主なエラーパターン:**

#### パターン1: `Uncaught SyntaxError`
```
Uncaught SyntaxError: Unexpected token '<'
```
→ **原因:** JavaScriptの構文エラー
→ **解決策:** index.htmlの構文を修正

#### パターン2: `Uncaught ReferenceError`
```
Uncaught ReferenceError: React is not defined
```
→ **原因:** Reactライブラリが読み込まれていない
→ **解決策:** CDNの接続を確認

#### パターン3: `Uncaught TypeError`
```
Uncaught TypeError: Cannot read property 'map' of undefined
```
→ **原因:** データ構造の問題
→ **解決策:** 初期データの形式を確認

#### パターン4: エラーなし（何も表示されない）
→ **原因:** ブラウザキャッシュ
→ **解決策:** スーパーリロード

---

## 🛠️ 解決方法

### 解決法1: ブラウザキャッシュをクリア

**最も一般的な原因です。まずこれを試してください。**

#### 方法A: スーパーリロード
- Windows/Linux: `Ctrl+Shift+R` または `Ctrl+F5`
- Mac: `Cmd+Shift+R`

#### 方法B: 完全なキャッシュクリア
1. ブラウザ設定を開く
2. プライバシーとセキュリティ
3. 「閲覧データを削除」または「キャッシュをクリア」
4. 「キャッシュされた画像とファイル」を選択
5. 削除を実行

#### 方法C: シークレットモードで開く
- Windows/Linux: `Ctrl+Shift+N` (Chrome) / `Ctrl+Shift+P` (Firefox)
- Mac: `Cmd+Shift+N` (Chrome) / `Cmd+Shift+P` (Firefox)
- シークレットモードでindex.htmlを開く

---

### 解決法2: 最新のindex.htmlを使用

**古いバージョンのファイルを使用している可能性があります。**

1. **Gitで最新版をプル**
   ```bash
   cd /home/user/noble1
   git checkout claude/fix-blank-page-issue-MFYQS
   git pull origin claude/fix-blank-page-issue-MFYQS
   ```

2. **ファイルのタイムスタンプを確認**
   ```bash
   ls -l index.html
   ```
   最終更新日が今日の日付か確認

3. **最新のコミットを確認**
   ```bash
   git log -1 --oneline
   ```
   `35fa544` または `eead4bd` または `947692d` が表示されるか確認

---

### 解決法3: CDN接続の確認

**外部ライブラリが読み込めていない可能性があります。**

1. デベロッパーツールの「Network」タブを開く
2. ページをリロード
3. 以下のファイルが正常に読み込まれているか確認:
   - `react.production.min.js` (Status: 200)
   - `react-dom.production.min.js` (Status: 200)
   - `recharts.min.js` (Status: 200)
   - `babel-standalone.min.js` (Status: 200)

**もしStatus: 失敗の場合:**
- インターネット接続を確認
- ファイアウォール設定を確認
- 別のネットワークで試す

---

### 解決法4: GAS自動読み込みを無効化

**GASのエラーが画面表示を妨げている可能性があります。**

index.htmlの4723-4726行目を確認:

```javascript
// この部分がコメントアウトされているか確認
// if (GAS_WEB_APP_URL && GAS_WEB_APP_URL !== 'YOUR_GAS_WEB_APP_URL_HERE') {
//     handleLoadFromSpreadsheet();
// }
```

**もしコメントアウトされていない場合:**
```javascript
// 以下のように変更
if (false) { // 一時的に無効化
    handleLoadFromSpreadsheet();
}
```

---

### 解決法5: 簡易版で動作確認

**問題を切り分けるため、最小限のHTMLで確認します。**

以下の内容で `test.html` を作成:

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>テスト</title>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
</head>
<body>
    <div id="root"></div>
    <script type="text/babel">
        const App = () => {
            return (
                <div style={{padding: '40px', fontFamily: 'sans-serif'}}>
                    <h1 style={{color: 'green'}}>✓ React is working!</h1>
                    <p>もしこのメッセージが表示されている場合、Reactは正常に動作しています。</p>
                    <p>index.htmlの特定のコード箇所に問題がある可能性があります。</p>
                </div>
            );
        };

        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<App />);
    </script>
</body>
</html>
```

**test.htmlをブラウザで開く:**
- ✓ 緑のメッセージが表示される → React正常、index.html内のコードに問題
- ✗ 白い画面のまま → 環境の問題（ブラウザ、ネットワークなど）

---

## 📊 現在の修正状況

### 修正済み (コミット 35fa544)
✅ **Recharts XAxisの属性エラー**
- `angle` と `textAnchor` を `tick` オブジェクト内に移動
- 行番号: 1377

### 修正済み (コミット eead4bd)
✅ **GAS初回自動読み込みを無効化**
- データ取得失敗が画面表示を妨げないようにする
- 行番号: 4723-4726

### 確認済み
✅ **すべてのJSX構文**
✅ **すべての括弧・ブレースのバランス**
✅ **すべてのRechartsコンポーネント**
✅ **monthlyDataの定義と使用**
✅ **エラーハンドリング**

---

## 💡 それでも解決しない場合

### 情報収集

以下の情報を提供してください:

1. **ブラウザのコンソールエラー**
   - F12 → Console タブのスクリーンショット
   - エラーメッセージ全文のコピー

2. **Network タブの状態**
   - F12 → Network タブ
   - 赤くなっているファイルがあるか

3. **使用環境**
   - OS (Windows/Mac/Linux)
   - ブラウザ (Chrome/Firefox/Safari/Edge)
   - ブラウザのバージョン

4. **ファイル情報**
   ```bash
   git log -1
   ls -lh index.html
   head -5 index.html
   ```

5. **表示される内容**
   - 完全に白い画面か
   - 読み込み中のアイコンが表示されるか
   - エラーメッセージが表示されるか

---

## 🚀 クイックチェックリスト

問題解決のために、以下を順番に試してください:

- [ ] ブラウザでスーパーリロード (`Ctrl+Shift+R` / `Cmd+Shift+R`)
- [ ] シークレットモードで開く
- [ ] F12でコンソールのエラーを確認
- [ ] Networkタブで読み込みエラーを確認
- [ ] 最新のindex.htmlを使用しているか確認 (`git log -1`)
- [ ] test.htmlで動作確認
- [ ] 別のブラウザで試す
- [ ] インターネット接続を確認

---

## 📞 次のステップ

1. 上記のチェックリストを実行
2. コンソールのエラーメッセージをコピー
3. test.htmlの結果を確認
4. 収集した情報を共有

この情報があれば、問題を特定して修正できます。
