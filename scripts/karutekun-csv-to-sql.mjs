#!/usr/bin/env node
// ============================================================
// カルテくん（KaruteKun）の CSV を、そのまま実行できる SQL に変換する。
//
//   node scripts/karutekun-csv-to-sql.mjs <CSVのフォルダ> [出力フォルダ]
//
//   例: node scripts/karutekun-csv-to-sql.mjs ~/Downloads/カルテくん supabase/import
//
// 出力される SQL は「これだけ実行すれば取り込みが終わる」形になっている:
//   ・01_setup.sql に 023_karutekun_import.sql の中身を丸ごと同梱するため、
//     事前にマイグレーションを流していなくてもよい（何度実行しても安全）
//   ・データは INSERT 文として埋め込むので、CSV のアップロードは不要
//   ・最後の 99_run_import.sql が本番テーブルへの変換
//
// 出力は2通り用意する:
//   import_all.sql … 全部入りの1ファイル（psql・SQL Editor のファイル読込用）
//   split/NN_*.sql … SQL Editor に貼れる大きさに分割したもの
//
// ※ 出力には個人情報が含まれる。/supabase/import/ は .gitignore 済み。
// ============================================================

import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Supabase の SQL Editor には実行できるクエリの大きさに上限があり、超えると
//   Error: Query is too large to be run via the SQL Editor
// で1行も実行されない。上限の正確な値は公開されていないため、余裕をもって
// 250KB（日本語で約9万文字）で切る。
const MAX_BYTES = 250 * 1024;
const ROWS_PER_INSERT = 50;

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = join(repoRoot, "supabase/migrations/023_karutekun_import.sql");

// 取込テーブルの定義。
//   all  : CSV のヘッダー（この並び・列数でファイル種別を判定する）
//   used : import_karutekun() が実際に読む列だけ。
//          INSERT はこの列だけを書き出す（残りは null のまま）。
//          出力サイズが約2割減り、貼り付ける回数が減る。
const TABLES = {
  import_karte: {
    all: [
      "カルテ番号", "サロン名", "お客様名", "よみがな", "性別", "アレルギー等の注意事項",
      "メモ", "生年月日(年)", "生年月日(月)", "生年月日(日)", "職業", "電話番号", "メール",
      "郵便番号", "住所", "初回来店日時", "最終来店日時", "最終担当スタッフ", "来店回数",
      "総支払額", "施術合計売上", "店販合計売上", "来店周期(日数)", "顧客セグメント",
      "作成日時", "最終更新日時", "来店動機",
      "[グループ]初回来店日時", "[グループ]最終来店日時", "[グループ]最終担当スタッフ",
      "[グループ]来店回数", "[グループ]総支払額", "[グループ]施術合計売上",
      "[グループ]店販合計売上", "[グループ]来店周期(日数)", "[グループ]顧客セグメント",
    ],
    used: [
      "カルテ番号", "サロン名", "お客様名", "よみがな", "性別", "アレルギー等の注意事項",
      "メモ", "生年月日(年)", "生年月日(月)", "生年月日(日)", "職業", "電話番号", "メール",
      "郵便番号", "住所", "初回来店日時", "最終担当スタッフ", "来店動機", "最終更新日時",
    ],
    label: "顧客（カルテデータ）",
  },
  import_visits: {
    all: [
      "来店記録番号", "サロン名", "カルテ番号", "お客様名", "主担当", "開始時刻", "終了時刻",
      "指名フラグ", "メモ", "訪問回数", "作成日時", "最終更新日時", "施術合計売上(税込)",
      "店販合計売上(税込)", "税額", "税端数処理", "会計状態", "お釣り", "現金",
      "クレジットカード", "ポイント", "その他",
    ],
    used: [
      "来店記録番号", "サロン名", "カルテ番号", "主担当", "開始時刻", "終了時刻",
      "指名フラグ", "メモ", "最終更新日時",
    ],
    label: "来店記録（カルテ1枚ずつ）",
  },
  import_visit_items: {
    all: [
      "来店記録番号", "名前", "大カテゴリ", "小カテゴリ", "数量", "定価", "価格調整後の単価",
      "割引按分後の単価", "売上(税込)", "税額", "税率", "内税・外税", "調整理由",
      "担当者1", "担当者1売上", "担当者1指名フラグ",
      "担当者2", "担当者2売上", "担当者2指名フラグ",
      "担当者3", "担当者3売上", "担当者3指名フラグ",
      "担当者4", "担当者4売上", "担当者4指名フラグ",
      "担当者5", "担当者5売上", "担当者5指名フラグ",
    ],
    used: [
      "来店記録番号", "名前", "小カテゴリ",
      "担当者1", "担当者2", "担当者3", "担当者4", "担当者5",
    ],
    label: "施術明細・回数券の消化",
  },
};

// ---------- CSV パーサ（引用符内の改行・カンマ・二重引用符に対応） ----------
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\r") { /* 無視 */ }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// ---------- SQL リテラル ----------
function lit(v) {
  if (v === undefined || v === null || v === "") return "null";
  // NUL は Postgres の text に入らないため除去
  return "'" + v.replace(/\0/g, "").replace(/'/g, "''") + "'";
}

function ident(name) {
  return '"' + name.replace(/"/g, '""') + '"';
}

// ---------- ヘッダーから取込テーブルを判定 ----------
function detectTable(header) {
  for (const [table, def] of Object.entries(TABLES)) {
    if (def.all.length === header.length && def.all[0] === header[0] && def.all[1] === header[1]) {
      return table;
    }
  }
  return null;
}

// ============================================================
const srcDir = process.argv[2];
const outDir = process.argv[3] ?? "supabase/import";
if (!srcDir) {
  console.error("使い方: node scripts/karutekun-csv-to-sql.mjs <CSVのフォルダ> [出力フォルダ]");
  process.exit(1);
}
if (!existsSync(MIGRATION)) {
  console.error(`マイグレーションが見つかりません: ${MIGRATION}`);
  process.exit(1);
}

const splitDir = join(outDir, "split");
if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(splitDir, { recursive: true });

const csvFiles = readdirSync(srcDir).filter((f) => f.toLowerCase().endsWith(".csv")).sort();
if (csvFiles.length === 0) {
  console.error(`CSV が見つかりません: ${srcDir}`);
  process.exit(1);
}

// テーブルごとに行を集める（来店記録は店舗ごとに2ファイルあるため）
const collected = { import_karte: [], import_visits: [], import_visit_items: [] };
const summary = [];

for (const file of csvFiles) {
  const rows = parseCsv(readFileSync(join(srcDir, file), "utf8"));
  if (rows.length === 0) continue;
  const header = rows[0].map((h) => h.trim());
  const table = detectTable(header);
  if (!table) {
    console.warn(`⚠ 取込対象外としてスキップ: ${file}（列数 ${header.length}）`);
    continue;
  }
  const order = TABLES[table].used.map((c) => header.indexOf(c));
  if (order.some((i) => i < 0)) {
    const missing = TABLES[table].used.filter((c) => !header.includes(c));
    console.warn(`⚠ 列が足りないためスキップ: ${file}（不足: ${missing.join(", ")}）`);
    continue;
  }
  const body = rows.slice(1).filter((r) => r.some((v) => v !== ""));
  for (const r of body) collected[table].push(order.map((i) => r[i] ?? ""));
  summary.push(`${basename(file)} → ${table}（${body.length} 行）`);
}

// ---------- 各パートを組み立てる ----------
// 01: マイグレーション同梱 + 取込テーブルを空にする
const setupSql =
  `-- ============================================================\n` +
  `-- 01_setup.sql : 取り込みの準備\n` +
  `--   supabase/migrations/023_karutekun_import.sql の中身をそのまま同梱。\n` +
  `--   すでに実行済みでも、もう一度実行して問題ありません。\n` +
  `-- ============================================================\n\n` +
  readFileSync(MIGRATION, "utf8") +
  `\n-- 取込テーブルを空にする（本番テーブルには影響しません）\n` +
  `truncate table public.import_karte, public.import_visits, public.import_visit_items;\n`;

// 02〜: データ本体
const dataParts = []; // { name, sql }
let fileNo = 1;
for (const [table, rows] of Object.entries(collected)) {
  if (rows.length === 0) continue;
  const cols = TABLES[table].used.map(ident).join(", ");
  const chunks = [];
  let buf = "";
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    const values = rows.slice(i, i + ROWS_PER_INSERT).map((r) => "(" + r.map(lit).join(",") + ")").join(",\n");
    const stmt = `insert into public.${table} (${cols}) values\n${values};\n`;
    // 追記して上限を超えるなら、先に切り出す（1ファイルが極端に大きくならないように）
    if (buf && Buffer.byteLength(buf) + Buffer.byteLength(stmt) > MAX_BYTES) { chunks.push(buf); buf = ""; }
    buf += stmt;
  }
  if (buf) chunks.push(buf);
  chunks.forEach((sql, idx) => {
    fileNo++;
    dataParts.push({
      name: `${String(fileNo).padStart(2, "0")}_${table}_${idx + 1}of${chunks.length}.sql`,
      sql:
        `-- ${TABLES[table].label} : ${table}（全 ${rows.length} 行のうち ${idx + 1}/${chunks.length} 個目）\n` +
        sql,
    });
  });
}

// 99: 変換の実行と結果確認
const runSql =
  `-- ============================================================\n` +
  `-- 99_run_import.sql : 取込テーブル → 本番テーブルへ変換\n` +
  `--   何度実行しても重複しません。処理ごとの件数が表で返ります。\n` +
  `-- ============================================================\n` +
  `select * from public.import_karutekun();\n`;

// ---------- 書き出し ----------
const written = [];
function write(dir, name, content) {
  writeFileSync(join(dir, name), content, "utf8");
  written.push(`${name}（${(Buffer.byteLength(content) / 1024).toFixed(0)} KB）`);
}

write(splitDir, "01_setup.sql", setupSql);
for (const p of dataParts) write(splitDir, p.name, p.sql);
write(splitDir, "99_run_import.sql", runSql);

const allSql = [setupSql, ...dataParts.map((p) => p.sql), runSql].join("\n");
writeFileSync(join(outDir, "import_all.sql"), allSql, "utf8");

const order = ["01_setup.sql", ...dataParts.map((p) => p.name), "99_run_import.sql"];
writeFileSync(
  join(outDir, "README.md"),
  `# カルテくんデータ取り込み用 SQL（自動生成）\n\n` +
    `**このフォルダには個人情報が含まれます。コミット・共有しないでください。**\n\n` +
    `> ⚠️ \`import_all.sql\` は Supabase の **SQL Editor には貼れません**。\n` +
    `> 大きすぎて \`Query is too large to be run via the SQL Editor\` になり、\n` +
    `> 1行も実行されません。SQL Editor を使うなら \`split/\` の方です。\n\n` +
    `## 方法1: DBに直接つないで1回で流す（一番速い）\n\n` +
    "```bash\n" +
    `psql "<接続文字列>" -v ON_ERROR_STOP=1 -f import_all.sql\n` +
    "```\n\n" +
    `接続文字列は Supabase → Project Settings → Database → Connection string（URI）。\n` +
    `TablePlus / DBeaver / pgAdmin などの GUI クライアントでも、同じ接続情報で\n` +
    `\`import_all.sql\` を開いて実行できます（ターミナル不要）。\n\n` +
    `## 方法2: SQL Editor に貼り付け（${order.length} 回）\n\n` +
    `\`split/\` の中を**番号順に**開き、中身を全選択して Supabase の SQL Editor に貼り、\n` +
    `1ファイルずつ Run します。順番を飛ばさないでください。\n` +
    `1ファイルは 250KB 以下に切ってあるので SQL Editor の上限には掛かりません。\n\n` +
    order.map((n, i) => `${i + 1}. \`split/${n}\``).join("\n") +
    `\n\n最後の \`99_run_import.sql\` が処理件数の表を返せば完了です。\n\n` +
    `## 方法3: CSV をそのままアップロードする（SQLを貼る回数が一番少ない）\n\n` +
    `\`split/01_setup.sql\` だけ SQL Editor で実行したあと、Supabase の Table Editor で\n` +
    `\`import_karte\` / \`import_visits\` / \`import_visit_items\` に元の CSV を\n` +
    `Insert → Import data from CSV でアップロードし、最後に SQL Editor で1行:\n\n` +
    "```sql\n" +
    `select * from public.import_karutekun();\n` +
    "```\n\n" +
    `## 途中で失敗したら\n\n` +
    `\`01_setup.sql\` からやり直してください（取込テーブルを空にしてから入れ直します）。\n` +
    `同じファイルを二重に貼ってしまった場合も、そのまま最後まで進めて問題ありません\n` +
    `（重複した行は取り込み時に1件へまとめられます）。\n`,
  "utf8"
);

console.log("読み込んだ CSV:");
summary.forEach((s) => console.log("  " + s));
console.log(`\n出力先: ${outDir}`);
console.log(`  import_all.sql（${(Buffer.byteLength(allSql) / 1048576).toFixed(1)} MB）… 全部入り`);
console.log(`  README.md … 実行手順`);
console.log(`  split/ … SQL Editor 用に分割（${order.length} ファイル）`);
written.forEach((w) => console.log("    " + w));
