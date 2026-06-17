import Link from "next/link";
import { Card, SectionTitle } from "@/components/ui";

export const metadata = { title: "ヘルプ | Noble" };

// スタッフ向けの使い方マニュアル
export default function HelpPage() {
  return (
    <div className="space-y-5 fade-in max-w-3xl mx-auto">
      <div>
        <h1 className="serif text-3xl text-ink">使い方ガイド</h1>
        <p className="text-sm text-muted mt-1">
          このシステムの操作方法をまとめています。困ったときはここを確認してください。
        </p>
      </div>

      {/* 目次 */}
      <Card className="p-4">
        <SectionTitle>目次</SectionTitle>
        <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm">
          {[
            ["#flow", "1日の基本の流れ"],
            ["#counseling", "カウンセリング（LINE受付）"],
            ["#karte", "カルテの記入"],
            ["#customer", "お客様・回数券"],
            ["#shift", "予定・シフト"],
            ["#board", "掲示板・在庫"],
            ["#admin", "経営メニュー（管理者）"],
            ["#line", "LINEリッチメニューの設定"],
            ["#pwa", "ホーム画面に追加する"],
            ["#trouble", "困ったとき"],
          ].map(([href, label]) => (
            <li key={href}>
              <a href={href} className="text-gold-dk hover:underline underline-offset-2">
                ◆ {label}
              </a>
            </li>
          ))}
        </ul>
      </Card>

      <Section id="flow" title="1日の基本の流れ">
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            朝、画面上部の<strong>「今日」</strong>を開きます。本日のご予約が時刻順に並びます。
          </li>
          <li>
            前日までにサロンボードで入った予約は、
            <Link href="/visits/new" className="text-gold-dk underline underline-offset-2">
              「＋来店予定を作る」
            </Link>
            で「空のカルテ（箱）」を先に作っておきます（お客様検索 → 時間・担当・メニューを選ぶだけ）。
          </li>
          <li>
            施術後、その行をタップ →「カルテを記入する」で内容を入力します。
          </li>
          <li>
            <strong>未記入のカルテはオレンジ色</strong>で表示されます。終業時にゼロにするのが目標です。
          </li>
          <li>
            画面上部の<strong>店舗タブ（全店舗／新宿店／新宿南口店／恵比寿店）</strong>で、
            表示する店舗をいつでも切り替えられます。
          </li>
        </ol>
      </Section>

      <Section id="counseling" title="カウンセリング（LINE受付）">
        <p>
          お客様にLINEからカウンセリングを記入してもらい、その内容を見ながらカルテを作成できます。
          サロンボード（HPB）との自動連携の代わりとなる運用です。
        </p>
        <p className="font-semibold text-ink mt-3">お客様側の流れ</p>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>ご来店時（または事前に）、LINE公式アカウントを友だち追加していただく</li>
          <li>LINEのリッチメニュー（下部のメニュー）の「カウンセリング」をタップ</li>
          <li>お名前・連絡先・お悩み・注意事項の確認などを入力して送信</li>
        </ol>
        <p className="font-semibold text-ink mt-3">スタッフ側の流れ</p>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>
            送信されると「今日」ボードの上部に
            <strong>「新着カウンセリングが届いています」</strong>バナーが出ます。
          </li>
          <li>
            タップして
            <Link href="/intake" className="text-gold-dk underline underline-offset-2">
              受付
            </Link>
            画面へ。回答内容を確認します（妊娠中・通院中など注意が必要な回答は色付きで強調されます）。
          </li>
          <li>
            <strong>「新規登録してカルテ作成」</strong>（初めてのお客様）または
            <strong>「既存のお客様に紐付け」</strong>（再来のお客様）を選びます。
          </li>
          <li>
            自動でカルテが作成され、編集画面が開きます。回答を見ながらメニュー・部位・メモを記入して保存します。
          </li>
        </ol>
        <p className="text-muted text-xs mt-2">
          ※ 特定のお客様あてに個別のフォームを送りたい場合は、お客様ページの
          「カウンセリング・同意書」から発行 →「LINEで送る」も使えます。
        </p>
      </Section>

      <Section id="karte" title="カルテの記入">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>施術メニュー・施術部位は<strong>チップをタップ</strong>で複数選択できます。</li>
          <li>
            <strong>「前回と同じ」</strong>を押すと、前回のメニュー・部位を複製できます。
          </li>
          <li>
            回数券をお持ちのお客様は「回数券の利用」からタップで1回消化できます。
            誤操作は「取り消す」で戻せます。
          </li>
          <li>施術前後の写真は Before / After で並べて保存できます（その場で撮影も可）。</li>
          <li>
            <strong>重要事項メモ</strong>に書いた内容は、次回来店時のカルテ上部に必ず表示されます。
          </li>
          <li>記入が終わったら「記入を完了する」を押すとステータスが「記入済み」になります。</li>
        </ul>
      </Section>

      <Section id="customer" title="お客様・回数券">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <Link href="/customers" className="text-gold-dk underline underline-offset-2">
              お客様
            </Link>
            ページで、名前・カナ・電話番号の一部から検索できます。
          </li>
          <li>
            お客様ページでは、<strong>注意フラグ・申し送り</strong>が一番上に表示されます。
            来店前に必ず確認してください。
          </li>
          <li>回数券の販売登録、来店履歴（写真付き）、LINEトークへのリンクもここから。</li>
          <li>有効期限が近い・残り1回の回数券は、自動でバッジ表示されます。</li>
        </ul>
      </Section>

      <Section id="shift" title="予定・シフト">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <Link href="/calendar" className="text-gold-dk underline underline-offset-2">
              予定
            </Link>
            は月表示の共有カレンダーです。シフト・定期タスク（ゴミ出し等）・研修・撮影などを共有します。
          </li>
          <li>
            「マイシフト」で、シフト希望の提出（○／×／時間指定／いつも通り／お任せ）、
            確定シフトの確認、勤務実績の記録ができます。
          </li>
          <li>管理者は「シフト管理」で希望を見ながらシフトを作成・確定できます。</li>
        </ul>
      </Section>

      <Section id="board" title="掲示板・在庫">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <Link href="/board" className="text-gold-dk underline underline-offset-2">
              掲示板
            </Link>
            は店舗ルール・FAQ・研修資料などの共有場所です（投稿は管理者）。
          </li>
          <li>
            <Link href="/inventory" className="text-gold-dk underline underline-offset-2">
              在庫
            </Link>
            では入庫登録（納品書の撮影保存）と月末棚卸ができます。理論在庫はカルテの施術記録から自動計算されます。
          </li>
        </ul>
      </Section>

      <Section id="admin" title="経営メニュー（管理者）">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>売上の実績入力、経営サマリー、媒体分析、スタッフ実績、シミュレーション。</li>
          <li>
            <strong>マスタ管理</strong>では、メニュー・施術部位・回数券商品・
            カウンセリング項目・同意書テンプレート・スタッフなどを編集できます。
          </li>
          <li>これらの経営データはスタッフには表示されません。</li>
        </ul>
      </Section>

      <Section id="line" title="LINEリッチメニューの設定（管理者向け）">
        <p>
          お客様がLINEからカウンセリングに進めるよう、LINE公式アカウントのリッチメニューに
          リンクを設定します。一度設定すれば、以降はすべてのお客様が同じボタンから利用できます。
        </p>
        <p className="font-semibold text-ink mt-3">設定するURL</p>
        <div className="rounded-lg bg-base border border-hairline p-3 text-sm break-all">
          <code>https://noble1.vercel.app/f/new</code>
        </div>
        <p className="text-xs text-muted">
          ※ 独自ドメインを設定している場合は、そのドメインの <code>/f/new</code> を指定してください。
        </p>
        <p className="font-semibold text-ink mt-3">手順</p>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>
            パソコンで
            <a
              href="https://manager.line.biz/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold-dk underline underline-offset-2"
            >
              LINE Official Account Manager
            </a>
            にログインし、ノーブルの公式アカウントを開きます。
          </li>
          <li>左メニューの「トークルーム管理」→「リッチメニュー」→「作成」。</li>
          <li>
            タイトル・表示期間を設定し、テンプレートを選択（例：大きなボタンが並ぶレイアウト）。
          </li>
          <li>
            背景画像を設定します（各ボタンの位置に「カウンセリング」などの文字を入れた画像を用意）。
          </li>
          <li>
            「カウンセリング」のボタン枠を選び、<strong>アクションタイプを「リンク」</strong>にして、
            上記のURL <code>https://noble1.vercel.app/f/new</code> を貼り付けます。
          </li>
          <li>「保存」して、メニューを「表示する」に設定すれば完了です。</li>
        </ol>
        <p className="text-xs text-muted mt-2">
          補足：LINEの友だち追加用QRコード・URLも同じ管理画面から取得できます。来店時にお客様へご案内ください。
        </p>
      </Section>

      <Section id="pwa" title="ホーム画面に追加する（アプリのように使う）">
        <p className="font-semibold text-ink">iPad / iPhone（Safari）</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>このシステムを Safari で開く</li>
          <li>画面下（または上）の「共有」ボタンをタップ</li>
          <li>「ホーム画面に追加」を選ぶ</li>
        </ol>
        <p className="font-semibold text-ink mt-3">Android（Chrome）</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Chrome で開く → 右上のメニュー（⋮）</li>
          <li>「アプリをインストール」または「ホーム画面に追加」</li>
        </ol>
        <p className="text-muted text-xs mt-2">
          追加すると、ロゴのアイコンから全画面で起動でき、毎回URLを入力する必要がなくなります。
        </p>
      </Section>

      <Section id="trouble" title="困ったとき">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>画面が真っ白・古い表示のまま</strong>：ページを再読み込み（引っ張って更新）してください。
          </li>
          <li>
            <strong>ログインできない</strong>：メールアドレス・パスワードをご確認ください。
            分からない場合は管理者（marin）にお問い合わせください。
          </li>
          <li>
            <strong>お客様の回答が受付に出てこない</strong>：お客様が送信を完了しているかご確認ください。
            「今日」ボードのバナー、または受付ページを再読み込みすると最新になります。
          </li>
          <li>
            操作で分からないことがあれば、まず管理者にご相談ください。
          </li>
        </ul>
      </Section>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4 space-y-2 scroll-mt-20" >
      <h2 id={id} className="serif text-lg font-semibold text-ink scroll-mt-20">
        {title}
      </h2>
      <div className="text-sm text-ink leading-relaxed space-y-2">{children}</div>
    </Card>
  );
}
