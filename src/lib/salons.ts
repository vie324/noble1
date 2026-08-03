// ============================================================
// お客様向け店舗紹介ページ（/salons）の掲載内容
//
// LINEリッチメニューの「ご予約」ボタンから開かれるページで使用します。
// 営業時間・道案内などを変更したいときは、このファイルだけを編集してください。
//
// code は Supabase の stores.code と一致させています
//   （shinjuku / shinjuku-south / ebisu）
// 出典: ホットペッパービューティー 各店舗ページ（hpbUrl）
// ============================================================

export interface SalonInfo {
  /** stores.code と一致するスラッグ。URL は /salons/[code] */
  code: string;
  /** 店舗名（システム内の stores.name と揃える） */
  name: string;
  /** ページ見出しに使う欧文表記 */
  nameEn: string;
  /** 一覧カードの一文キャッチ */
  catch: string;
  /** 郵便番号なしの住所 */
  address: string;
  /** 最寄駅（一覧カードに出す短い表記） */
  accessShort: string;
  /** アクセスの補足（複数駅など） */
  accessLines: string[];
  /** ホットペッパー掲載の「道案内」 */
  directions: string;
  /** 営業時間 */
  hours: string;
  /** 最終受付（記載がなければ null） */
  lastReception: string | null;
  /** 定休日 */
  closedDays: string;
  /** 電話番号（LINE問い合わせのみの店舗は null） */
  tel: string | null;
  /** LINE公式アカウントID（@つき） */
  lineId: string;
  /** 設備 */
  facility: string;
  /** スタッフ数 */
  staffCount: string;
  /** 価格帯（初回 / 2回目以降）。掲載がなければ null */
  priceRange: { first: string; repeat: string } | null;
  /** 店舗の特徴タグ */
  features: string[];
  /** ご来店時のお願い（注意事項） */
  notes: string[];
  /** ホットペッパービューティーの店舗ページ */
  hpbUrl: string;
  /** ネット予約（クーポン選択）ページ */
  reserveUrl: string;
  /** 地図検索に使う文字列（建物名まで入れると精度が上がる） */
  mapQuery: string;
}

/** 全店舗共通の支払い方法 */
export const PAYMENT_METHODS = [
  "Visa",
  "Mastercard",
  "JCB",
  "American Express",
  "Diners Club",
  "UnionPay（銀聯）",
  "Discover",
] as const;

/** 全店舗共通のご案内 */
export const COMMON_NOTES = [
  "完全予約制です。ご予約のお時間ちょうどにお越しください。",
  "プライベートサロンのため待合室がございません。",
  "施術中はお電話に出られないことがあります。ご連絡はLINEが確実です。",
  "駐車場のご用意はございません。近隣のコインパーキングをご利用ください。",
] as const;

export const SALONS: SalonInfo[] = [
  {
    code: "shinjuku",
    name: "新宿店",
    nameEn: "SHINJUKU",
    catch: "ハーブピーリング専門・完全個室のプライベートサロン",
    address: "東京都渋谷区代々木2-11-5 アクティブ新宿304",
    accessShort: "新宿駅 徒歩3分",
    accessLines: ["JR・小田急・京王 新宿駅 南口より徒歩3分"],
    directions:
      "新宿南口改札から右折し、大通り（甲州街道）沿いの坂を下って、初めに信号のある大きな交差点を左折してください。角にマクドナルドがありますので、そこを右折。直進すると左手にアイシークリニックが見えてきます。その真向かいの茶色いビル（1階に「クライネヒュッテ」という飲食店が入っています）の304号室です。",
    hours: "11:00〜22:00",
    lastReception: "21:00",
    closedDays: "不定休",
    tel: "070-3257-4259",
    lineId: "@437uhusa",
    facility: "総数1席（ベッド1）",
    staffCount: "総数5人（施術者5人）",
    priceRange: { first: "¥12,000〜", repeat: "¥18,000〜" },
    features: [
      "女性専用",
      "完全個室",
      "1人で貸切OK",
      "夜20時以降も受付OK",
      "当日受付OK",
      "駅から徒歩5分以内",
      "都度払いメニューあり",
      "回数券あり",
    ],
    // 全店舗共通の内容（COMMON_NOTES）は重複するため、ここには書かない
    notes: [
      "ご予約の変更・キャンセルは前日までにご連絡をお願いします。",
      "ご予約が取りにくい場合は新宿南口店もぜひご利用ください。",
    ],
    hpbUrl: "https://beauty.hotpepper.jp/kr/slnH000574408/",
    reserveUrl: "https://beauty.hotpepper.jp/kr/slnH000574408/coupon/",
    mapQuery: "東京都渋谷区代々木2-11-5 アクティブ新宿",
  },
  {
    code: "shinjuku-south",
    name: "新宿南口店",
    nameEn: "SHINJUKU MINAMIGUCHI",
    catch: "ハーブピーリング＆毛穴洗浄専門。代々木駅から徒歩1分",
    address: "東京都渋谷区代々木1-57-2 ドルミ代々木1301",
    accessShort: "代々木駅 徒歩1分 / 新宿駅 徒歩5分",
    accessLines: [
      "JR・都営大江戸線 代々木駅 北口より徒歩1分",
      "JR・小田急・京王 新宿駅 新南改札より徒歩5分",
    ],
    directions:
      "【代々木駅から】北口を出てタリーズコーヒーを正面に右折、そのまま直進し、ファミリーマートが入ったビルの13階です。\n【新宿駅から】バスタ・サザンテラス方面の新南改札を出て右折。直進するとスターバックスが見えますので角を左折し直進します。添好運・Francfranc も通り過ぎ、下りの階段を降りて左折。そのまま50mほど直進した先の、ファミリーマートが入ったビルの1301号室です。",
    hours: "10:00〜22:00",
    lastReception: null,
    closedDays: "不定休",
    tel: "080-4207-5470",
    lineId: "@444feqoe",
    facility: "総数2席（ベッド2）",
    staffCount: "総数5人（施術者5人）",
    priceRange: { first: "¥11,000〜", repeat: "¥17,000〜" },
    features: [
      "完全個室",
      "2名以上の利用OK",
      "メンズ歓迎",
      "夜20時以降も受付OK",
      "当日受付OK",
      "駅から徒歩5分以内",
      "都度払いメニューあり",
      "回数券あり",
    ],
    notes: [
      "平日・土曜の18時以降と日曜終日は、ビル入口のオートロックが開きません。到着後にお電話をお願いします。",
      "ハーブピーリングはダウンタイムがございます。ご予定に余裕をもってご予約ください。",
    ],
    hpbUrl: "https://beauty.hotpepper.jp/kr/slnH000624712/",
    reserveUrl: "https://beauty.hotpepper.jp/kr/slnH000624712/coupon/",
    mapQuery: "東京都渋谷区代々木1-57-2 ドルミ代々木",
  },
  {
    code: "ebisu",
    name: "恵比寿店",
    nameEn: "EBISU",
    catch: "自社開発ハーブピーリングで叶える肌質改善。3店舗目の恵比寿店",
    address: "東京都渋谷区恵比寿西1-15-2 アパルトマンイトウ807号室",
    accessShort: "恵比寿駅 徒歩3分",
    accessLines: [
      "JR恵比寿駅 西口より徒歩3分",
      "東京メトロ日比谷線 恵比寿駅 2番出口より徒歩3分",
    ],
    directions:
      "東京メトロ恵比寿駅2番出口、JR西口を出ます。駅を背にして西口ロータリーの横断歩道を三井住友銀行側に渡ります。さらに右手の横断歩道を渡り、サンマルクカフェとKFCの間の道を50mほど直進すると、左側に十字路に面した青い建物があります。その807号室です（建物の入口は奥側になります）。",
    hours: "10:00〜22:00",
    lastReception: null,
    closedDays: "不定休",
    tel: null,
    lineId: "@437uhusa",
    facility: "総数3席（ベッド2）",
    staffCount: "総数5人（スタッフ2人）",
    priceRange: null,
    features: [
      "女性専用",
      "完全個室",
      "1人で貸切OK",
      "夜20時以降も受付OK",
      "当日受付OK",
      "駅から徒歩5分以内",
      "都度払いメニューあり",
      "回数券あり",
    ],
    notes: [
      "ご予約の変更・キャンセルは24時間前までにご連絡をお願いします。",
      "お電話番号は非公開です。お問い合わせはLINEをご利用ください。",
    ],
    hpbUrl: "https://beauty.hotpepper.jp/kr/slnH000817948/",
    reserveUrl: "https://beauty.hotpepper.jp/kr/slnH000817948/coupon/",
    mapQuery: "東京都渋谷区恵比寿西1-15-2 アパルトマンイトウ",
  },
];

export function findSalon(code: string): SalonInfo | undefined {
  return SALONS.find((s) => s.code === code);
}

/** APIキー不要の Google マップ埋め込みURL */
export function mapEmbedUrl(query: string): string {
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=17&hl=ja&output=embed`;
}

/** 地図アプリ／Googleマップで開くURL */
export function mapLinkUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** LINE公式アカウントの友だち追加URL（@つきIDを渡す） */
export function lineAddUrl(lineId: string): string {
  return `https://line.me/R/ti/p/${encodeURIComponent(lineId)}`;
}

/** tel: リンク用（ハイフン除去） */
export function telHref(tel: string): string {
  return `tel:${tel.replace(/-/g, "")}`;
}
