# index.html の設定箇所

GASデプロイ後、index.htmlで変更する必要がある箇所をまとめました。

---

## 📍 変更箇所1: GAS_WEB_APP_URL（必須）

### 場所: 929行目付近

以下の行を見つけて、デプロイしたGASのURLに変更してください。

### 変更前:
```javascript
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxmSKXpHDEVbHeKEIHrtk_DoQfXIsMXBExfa7CzhpkizuC_wf-UY5YqXn0Ctc4u6lbq/exec';
```

### 変更後:
```javascript
const GAS_WEB_APP_URL = 'あなたのGASデプロイURL';
```

### 📝 例:
```javascript
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/exec';
```

---

## 📍 変更箇所2: 初回自動読み込み（オプション）

### 場所: 4723-4726行目付近

現在、初回自動読み込みは**無効化**されています。

### 現在の状態（無効化）:
```javascript
useEffect(() => {
    // GAS URLが設定されている場合、自動的にデータを読み込む
    // 一時的に無効化: GAS設定が完了してから有効化してください
    // if (GAS_WEB_APP_URL && GAS_WEB_APP_URL !== 'YOUR_GAS_WEB_APP_URL_HERE') {
    //     handleLoadFromSpreadsheet();
    // }
}, []); // 初回マウント時のみ実行
```

### 有効化したい場合:
```javascript
useEffect(() => {
    // GAS URLが設定されている場合、自動的にデータを読み込む
    if (GAS_WEB_APP_URL && GAS_WEB_APP_URL !== 'YOUR_GAS_WEB_APP_URL_HERE') {
        handleLoadFromSpreadsheet();
    }
}, []); // 初回マウント時のみ実行
```

**注意:** GAS設定が完全に完了してから有効化することをお勧めします。

---

## 🔍 簡単な見つけ方

### 方法1: 行番号で検索

テキストエディタで「行に移動」機能を使う:
- VSCode: `Ctrl+G`（Mac: `Cmd+G`）
- メモ帳++: `Ctrl+G`
- Sublime Text: `Ctrl+G`

### 方法2: テキスト検索

テキストエディタで検索機能を使う:
- `Ctrl+F`（Mac: `Cmd+F`）で検索ウィンドウを開く
- 「`GAS_WEB_APP_URL`」を検索

---

## ✅ 確認方法

### 正しく設定できているか確認:

1. index.htmlを保存
2. ブラウザで開く
3. F12キーでコンソールを開く
4. エラーがないか確認
5. 右上の「保存」ボタンをクリック
6. 「✓ データをスプレッドシートに保存しました」と表示されればOK

---

## 🆘 よくある間違い

### ❌ URLの前後に余分な文字がある
```javascript
// 間違い
const GAS_WEB_APP_URL = ' https://script.google.com/.../exec ';  // スペースがある
```

### ❌ URLがシングルクォートで囲まれていない
```javascript
// 間違い
const GAS_WEB_APP_URL = https://script.google.com/.../exec;  // クォートなし
```

### ❌ 古いURLが残っている
```javascript
// 間違い
const GAS_WEB_APP_URL = 'YOUR_GAS_WEB_APP_URL_HERE';  // 置き換えられていない
```

### ✅ 正しい例
```javascript
// 正しい
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/exec';
```

---

## 📋 設定チェックリスト

設定が完了したら、以下を確認してください:

- [ ] GAS_WEB_APP_URLを正しいURLに変更した
- [ ] URLがシングルクォート `'` で囲まれている
- [ ] URLの前後に余分なスペースがない
- [ ] ファイルを保存した（Ctrl+S / Cmd+S）
- [ ] ブラウザでindex.htmlを開いた
- [ ] 「保存」ボタンで動作確認した
- [ ] スプレッドシートにデータが保存されたことを確認した

---

## 🚀 これで完了！

index.htmlの設定は以上です。

**問題がある場合:**
- ブラウザのコンソール（F12）でエラーを確認
- GAS_WEB_APP_URLが正しいか再確認
- ブラウザをスーパーリロード（Ctrl+Shift+R）
