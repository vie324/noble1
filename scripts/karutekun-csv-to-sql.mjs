#!/usr/bin/env node
// ============================================================
// カルテくん（KaruteKun）の CSV を、そのまま実行できる SQL に変換する。
//
//   node scripts/karutekun-csv-to-sql.mjs <CSVのフォルダ> [出力フォルダ]
//
//   例: node scripts/karutekun-csv-to-sql.mjs ~/Downloads/カルテくん supabase/import
//
// 出力された .sql を番号順に実行すると、取込テーブル（import_*）に
// データが入り、最後に public.import_karutekun() が本番テーブルへ変換します。
// 生成ファイルは Supabase の SQL Editor に貼れるサイズで分割されます。
// ============================================================

import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

const MAX_BYTES = 500 * 1024; // 1ファイルの目安（SQL Editor に貼れる大きさ）
const ROWS_PER_INSERT = 200;

// 取込テーブルの定義。列の並びは CSV のヘッダーと完全に一致させること。
const TABLES = {
  import_karte: [
    "カルテ番号", "サロン名", "お客様名", "よみがな", "性別", "アレルギー等の注意事項",
    "メモ", "生年月日(年)", "生年月日(月)", "生年月日(日)", "職業", "電話番号", "メール",
    "郵便番号", "住所", "初回来店日時", "最終来店日時", "最終担当スタッフ", "来店回数",
    "総支払額", "施術合計売上", "店販合計売上", "来店周期(日数)", "顧客セグメント",
    "作成日時", "最終更新日時", "来店動機",
    "[グループ]初回来店日時", "[グループ]最終来店日時", "[グループ]最終担当スタッフ",
    "[グループ]来店回数", "[グループ]総支払額", "[グループ]施術合計売上",
    "[グループ]店販合計売上", "[グループ]来店周期(日数)", "[グループ]顧客セグメント",
  ],
  import_visits: [
    "来店記録番号", "サロン名", "カルテ番号", "お客様名", "主担当", "開始時刻", "終了時刻",
    "指名フラグ", "メモ", "訪問回数", "作成日時", "最終更新日時", "施術合計売上(税込)",
    "店販合計売上(税込)", "税額", "税端数処理", "会計状態", "お釣り", "現金",
    "クレジットカード", "ポイント", "その他",
  ],
  import_visit_items: [
    "来店記録番号", "名前", "大カテゴリ", "小カテゴリ", "数量", "定価", "価格調整後の単価",
    "割引按分後の単価", "売上(税込)", "税額", "税率", "内税・外税", "調整理由",
    "担当者1", "担当者1売上", "担当者1指名フラグ",
    "担当者2", "担当者2売上", "担当者2指名フラグ",
    "担当者3", "担当者3売上", "担当者3指名フラグ",
    "担当者4", "担当者4売上", "担当者4指名フラグ",
    "担当者5", "担当者5売上", "担当者5指名フラグ",
  ],
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
  for (const [table, cols] of Object.entries(TABLES)) {
    if (cols.length === header.length && cols[0] === header[0] && cols[1] === header[1]) {
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

if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

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
  const cols = TABLES[table];
  // ヘッダーの並びが定義と違う場合に備えて名前で並べ替える
  const order = cols.map((c) => header.indexOf(c));
  if (order.some((i) => i < 0)) {
    console.warn(`⚠ 列が一致しないためスキップ: ${file}`);
    continue;
  }
  const body = rows.slice(1).filter((r) => r.some((v) => v !== ""));
  for (const r of body) collected[table].push(order.map((i) => r[i] ?? ""));
  summary.push(`${basename(file)} → ${table}（${body.length} 行）`);
}

// ---------- 出力 ----------
const written = [];
function write(name, content) {
  writeFileSync(join(outDir, name), content, "utf8");
  written.push(`${name}（${(Buffer.byteLength(content) / 1024).toFixed(0)} KB）`);
}

write(
  "00_reset.sql",
  `-- 取込テーブルを空にする（本番テーブルには影響しません）\n` +
    `truncate table public.import_karte, public.import_visits, public.import_visit_items;\n`
);

let fileNo = 0;
for (const [table, rows] of Object.entries(collected)) {
  if (rows.length === 0) continue;
  const cols = TABLES[table].map(ident).join(", ");
  let buf = "";
  let part = 0;
  const flush = () => {
    if (!buf) return;
    part++;
    fileNo++;
    write(
      `${String(fileNo + 10).padStart(2, "0")}_${table}_${String(part).padStart(3, "0")}.sql`,
      `-- ${table}: ${rows.length} 行のうち ${part} 個目\n` + buf
    );
    buf = "";
  };
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    const chunk = rows.slice(i, i + ROWS_PER_INSERT);
    const values = chunk.map((r) => "(" + r.map(lit).join(",") + ")").join(",\n");
    buf += `insert into public.${table} (${cols}) values\n${values};\n`;
    if (Buffer.byteLength(buf) >= MAX_BYTES) flush();
  }
  flush();
}

write(
  "99_run_import.sql",
  `-- 取込テーブル → 本番テーブルへ変換（何度実行しても重複しません）\n` +
    `select * from public.import_karutekun();\n`
);

console.log("読み込んだ CSV:");
summary.forEach((s) => console.log("  " + s));
console.log(`\n出力先: ${outDir}`);
written.forEach((w) => console.log("  " + w));
console.log(
  `\n実行方法（どちらでも）:\n` +
    `  ① psql "<接続文字列>" -v ON_ERROR_STOP=1 -f ${outDir}/*.sql を番号順に\n` +
    `  ② Supabase の SQL Editor に番号順で貼り付けて実行\n`
);
