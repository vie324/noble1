# カルテくん（KaruteKun）データの取り込み手順

旧システム「カルテくん」からエクスポートした CSV を、Noble のデータベースへ
**SQL だけで**取り込むための手順です。何度実行しても重複しません。

対応している CSV は次の3種類です。

| CSV | 取込テーブル | 主な中身 |
|---|---|---|
| `カルテデータ.csv` | `import_karte` | 顧客（氏名・カナ・電話・生年月日・住所・来店動機 など） |
| `来店記録データ_*.csv` | `import_visits` | 来店1件＝カルテ1枚（日時・担当・施術メモ） |
| `来店記録施術・店販データ_*.csv` | `import_visit_items` | 来店ごとの施術明細・回数券の消化 |

店舗ごとにファイルが分かれている場合（本店・南口店など）は、**同じ取込テーブルに
続けて入れて構いません**。CSV の「サロン名」列から自動的に店舗が振り分けられます。

---

## 事前準備（1回だけ）

`supabase/migrations/023_karutekun_import.sql` を Supabase の SQL Editor で実行します。
これで次のものが作られます。

- 取込テーブル `import_karte` / `import_visits` / `import_visit_items`
  （列名は CSV のヘッダーと**完全に同じ**なので、そのまま流し込めます）
- 施術名 → メニュー・部位の対応表 `import_menu_map`
- 変換関数 `public.import_karutekun()`
- 顧客・カルテの追加項目（生年月日・住所・アレルギー・指名 など）

---

## 取り込み（方法は2つ。どちらか一方でOK）

### 方法A：CSV をそのままアップロード（おすすめ・作業が一番少ない）

1. Supabase の管理画面 → **Table Editor** → テーブル `import_karte` を開く
2. 右上 **Insert → Import data from CSV** → `カルテデータ.csv` をアップロード
   - 列名が一致しているので、対応付けはそのままでOK
3. 同じ手順で
   - `import_visits` ← `来店記録データ_新宿本店.csv`、`来店記録データ_新宿南口店.csv`
   - `import_visit_items` ← `来店記録施術・店販データ_*.csv`
4. **SQL Editor** で次を実行

   ```sql
   select * from public.import_karutekun();
   ```

### 方法B：CSV を SQL ファイルに変換して実行

CSV を INSERT 文に変換します（Node.js が必要）。

```bash
node scripts/karutekun-csv-to-sql.mjs <CSVを置いたフォルダ> supabase/import
```

`supabase/import/` に番号付きの .sql が出力されるので、**番号順に**実行します。

```bash
# psql が使える場合（Supabase → Project Settings → Database の接続文字列）
for f in supabase/import/*.sql; do
  psql "<接続文字列>" -v ON_ERROR_STOP=1 -f "$f"
done
```

psql が使えない場合は、生成された .sql を番号順に SQL Editor へ貼り付けて実行して
ください（1ファイルが貼れるサイズに分割されています）。
最後の `99_run_import.sql` が変換処理です。

---

## 実行結果の見方

`import_karutekun()` は処理ごとの件数を返します。

```
       step       |                     detail                     | affected
------------------+------------------------------------------------+----------
 1. スタッフ      | 在籍していないスタッフを退職扱いで作成         |       15
 2. メニュー      | 不足していたメニューを作成                     |       20
 3. 顧客          | 登録・更新                                     |     3300
 4. 来店記録      | 登録・更新                                     |     7056
 5. 施術メニュー  | カルテに紐付け                                 |     6422
 5. 施術部位      | カルテに紐付け                                 |     6061
 6. 回数券        | コースを復元                                   |      569
 6. 回数券消化    | 消化履歴を登録                                 |     1658
 7. 初回/最終来店 | カルテ実データから再計算                       |     3239
 8. 集客媒体      | マスタを作成                                   |        8
 8. 媒体別新規    | 月次の新規数を登録                             |      373
```

取り込み後は、そのまま各画面で使えます。

- 顧客検索 `/customers` … 氏名・カナ・電話で検索
- 顧客ページ … アレルギー注意事項・生年月日・ご住所・来店動機・来店履歴・回数券
- カルテ一覧 `/visits` … 過去のカルテを期間・担当で絞り込み
- メニュー分析 `/admin/menus` … 施術メニュー・部位の月次集計
- 媒体分析 `/admin/analytics` … 媒体別の新規数

---

## 取り込みの中身（何がどこに入るか）

### 顧客（`customers`）

| CSV | 取り込み先 |
|---|---|
| カルテ番号 | `karte_no`（再取り込みの照合キー） |
| お客様名 / よみがな / 電話番号 / メール | `name` / `kana` / `phone` / `email` |
| サロン名 | `primary_store_id`（`stores.code` へ変換） |
| 性別 / 生年月日(年,月,日) / 職業 | `gender` / `birthday` / `occupation` |
| 郵便番号 / 住所 | `postal_code` / `address` |
| アレルギー等の注意事項 | `allergy_note`（顧客ページの最上部に警告表示） |
| 来店動機 | `acquisition_source` |
| メモ | `booking_memo` |

### カルテ（`visits`）

| CSV | 取り込み先 |
|---|---|
| 来店記録番号 | `karte_visit_no`（再取り込みの照合キー） |
| 開始時刻 | `scheduled_at`（日本時間として取り込み） |
| 主担当 | `staff_id`（氏名で突き合わせ） |
| メモ | `memo`（施術内容・会話内容がそのまま入ります） |
| 指名フラグ | `nominated` |

過去日の来店は `status = 'filled'`（記入済み）として取り込むため、
今日ボードの「未記入」件数には影響しません。

### 施術メニュー・部位

カルテくんは「剥離ハーブピーリング（背中全体）」のようにメニューと部位が
1つの名前になっているため、対応表 `import_menu_map` で2つに分解しています。

新しい施術名が増えたときは、この表に1行足すだけで取り込めるようになります。

```sql
insert into public.import_menu_map (item_name, menu_name, body_part_name)
values ('剥離ハーブピーリング（ふくらはぎ）', '剥離ハーブピーリング', '膝下裏');
```

対応表にない施術名があると、実行時に警告（WARNING）が出ます。
その明細のメニュー紐付けだけが飛ばされ、カルテ本体は取り込まれます。

### 回数券

明細の「回数券3回目（全5回）」という並びからコースを復元しています。

- 回数が **1回目に戻る／減る** ところを新しいコースの開始とみなします
- 残回数 = 総回数 − 消化済み回数
- 同じ来店で2回分消化しているケース（144件）もそのまま2回として記録します

---

## 注意事項

- **金額は入りません。** 元の CSV は「未会計」のまま運用されていたため、
  売上・支払額がほぼすべて 0 円で出力されています（8,957明細のうち金額があるのは86件）。
  そのため回数券の単価も 0 円で取り込まれます。金額が分かるものは
  「経営 > マスタ管理 > 回数券商品」から後で設定してください。
- **恵比寿店のデータはありません。** 今回の CSV は新宿本店・新宿南口店の2店舗分です。
- **退職済みスタッフ**は `is_active = false` のスタッフとして自動作成されます
  （過去のカルテの担当者を残すため）。メールは `<名前>@imported.noble.local` です。
  現在も在籍している方は、氏名が一致すれば既存のスタッフに紐付きます。
- **同じ方が2店舗に別カルテを持っている場合**、カルテ番号が違うため別の顧客として
  取り込まれます（電話番号が重複しているのは30件）。統合したい場合は手作業でお願いします。
- **再取り込みするとカルテのメモは CSV の内容で上書きされます。**
  取り込み後にアプリ側で追記した「📌重要事項」（`important_memo`）は上書きされません。

---

## 取り込みをやり直す・取り消す

取込テーブルを入れ替えてもう一度 `import_karutekun()` を実行すれば、
カルテ番号・来店記録番号で突き合わせて更新されます（重複しません）。

取り込んだデータだけを全部消す場合は次のとおりです。

```sql
-- 回数券 → カルテ → 顧客 の順に削除
delete from public.customer_tickets where import_key like 'kk:%';
delete from public.visits    where karte_visit_no is not null;
delete from public.customers where karte_no is not null;
truncate table public.import_karte, public.import_visits, public.import_visit_items;
```

スキーマごと戻す場合は `023_karutekun_import.sql` 冒頭のロールバック手順を参照してください。
