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
        <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-3 text-sm">
          {[
            ["#flow", "1日の基本の流れ"],
            ["#counseling", "カウンセリング（LINE受付）"],
            ["#karte", "カルテの記入"],
            ["#customer", "お客様・回数券"],
            ["#line-send", "お客様にLINEを送る（定型文・写真）"],
            ["#shift", "予定・シフト・勤務実績"],
            ["#documents", "給与明細・書類（マイ書類）"],
            ["#invoice", "請求書（業務委託の方）"],
            ["#board", "掲示板・在庫"],
            ["#admin", "経営メニュー（管理者）"],
            ["#payroll", "月締め・給与と税理士への共有（管理者）"],
            ["#line", "LINEリッチメニューの設定"],
            ["#pwa", "ホーム画面に追加する"],
            ["#trouble", "困ったとき"],
          ].map(([href, label]) => (
            <li key={href}>
              <a
                href={href}
                className="flex items-center min-h-10 rounded-lg px-1 text-gold-dk hover:bg-gold-soft/50 hover:underline underline-offset-2"
              >
                ◆ {label}
              </a>
            </li>
          ))}
        </ul>
      </Card>

      <Section id="flow" title="1日の基本の流れ">
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            朝、<strong>「今日」</strong>（スマホは画面下、PCは画面上のメニュー）を開きます。本日のご予約が時刻順に並びます。
            自分あての書類や請求書のお知らせも、ここの一番上に表示されます。
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
          <li>
            スマホでは、掲示板・在庫・マイシフト・マイ書類などは画面右下の<strong>「メニュー」</strong>から開きます。
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
          <li>
            記入が終わったら、画面下に固定された「記入を完了する」を押すとステータスが「記入済み」になります
            （途中で中断するときは「下書き保存」）。
          </li>
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

      <Section id="line-send" title="お客様にLINEを送る（定型文・写真）">
        <p>
          お客様ページの<strong>「✉ LINEで送る（定型文・写真）」</strong>から、店舗のLINE公式アカウントで
          お客様へメッセージを送れます（お客様のLINEが紐付いている場合）。
        </p>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>
            <strong>定型文</strong>（ご来店のお礼・次回予約の確認・前日のリマインドなど）を選びます。
            お客様名・店舗名・担当スタッフ・次回予約の日時は自動で入ります。本文は自由に書き換えられます。
          </li>
          <li>
            必要なら<strong>画像</strong>を最大4枚まで選びます（「画像ライブラリ」のアフターケア案内など、
            または「このお客様の写真」）。
          </li>
          <li>
            「確認へ進む」でLINEの見た目のプレビューを確認し、<strong>「この内容で送信」</strong>で送信します。
            自動では送られません。
          </li>
        </ol>
        <p className="text-xs text-muted">
          ※ 自動で入れられなかった項目は「【…を入力】」と表示されます。書き換えるまで送信できません。
          送った内容は、お客様ページの「最近の送信」で確認できます。定型文はマスタ管理 ＞ LINE定型文、
          画像は経営 ＞ LINE連携で管理者が登録します。
        </p>
      </Section>

      <Section id="shift" title="予定・シフト・勤務実績">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <Link href="/calendar" className="text-gold-dk underline underline-offset-2">
              予定
            </Link>
            は月表示の共有カレンダーです。シフト・定期タスク（ゴミ出し等）・研修・撮影などを共有します。
            スマホでは出勤スタッフのアイコンが並び、日付をタップすると詳細が見られます。
          </li>
          <li>
            「マイシフト」で、シフト希望の提出（○／×／時間指定／いつも通り／お任せ）、
            確定シフトの確認、勤務実績の記録ができます。
          </li>
          <li>
            確定シフトが出たら<strong>「まとめて確認する」</strong>で一度に確認できます。
          </li>
          <li>
            勤務が終わった日は<strong>「予定どおり」</strong>をタップするだけで実績が記録されます。
            残業・早退などで時間がずれた日は「時間を入力」から、理由と一緒に記録してください（給与計算に使われます）。
          </li>
          <li>管理者は「シフト管理」で希望を見ながらシフトを作成・確定できます。</li>
          <li>月締めが終わった月の実績は変更できません。修正が必要なときは管理者に連絡してください。</li>
        </ul>
      </Section>

      <Section id="documents" title="給与明細・書類（マイ書類）">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            給与明細や源泉徴収票など、税理士・管理者から届いた書類は
            <Link href="/my/documents" className="text-gold-dk underline underline-offset-2">
              マイ書類
            </Link>
            （メニュー ＞ マイ書類）で見られます。新しい書類が届くと「今日」とメニューにお知らせが出ます。
          </li>
          <li>「開く」で表示、「保存」で端末にダウンロードできます。</li>
          <li>書類は本人と管理者だけが見られます。ほかのスタッフには表示されません。</li>
        </ul>
      </Section>

      <Section id="invoice" title="請求書（業務委託の方）">
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>
            初回だけ、
            <Link href="/my/invoices" className="text-gold-dk underline underline-offset-2">
              請求書
            </Link>
            （メニュー ＞ 請求書）で請求者情報（氏名・住所・振込先・インボイス登録番号）を登録します。
          </li>
          <li>
            管理者が月締めをすると、その月の<strong>「請求書を作成」</strong>が押せるようになります。
            金額は勤務実績から自動で計算されます（報酬＋消費税10%＋交通費）。
          </li>
          <li>
            請求書の画面で<strong>「Gmailで送信」</strong>を押すと、宛先・件名・本文が入った状態で
            Gmailが開きます。そのまま送信してください（iPhoneはGmailアプリ、PCはブラウザのGmail）。
          </li>
          <li>送信できたら<strong>「送信済みにする」</strong>を押すと、管理者に送信済みと表示されます。</li>
        </ol>
        <p className="text-xs text-muted">
          ※ PDFが必要な場合は「PDFで保存・印刷」から保存できます（iPhoneは印刷画面の共有ボタン →「ファイルに保存」）。
        </p>
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
            <strong>目標設定</strong>では、店舗ごと・月ごとの売上と新規件数の目標（9月〜翌8月）を
            入力します。経営サマリーの「目標達成状況」で実績と比べられます。
          </li>
          <li>
            <strong>サロンワン連携</strong>：実績の売上・新規数はサロンワンから毎朝自動で取り込まれます
            （経営サマリーの「サロンワンから取り込む」ですぐ更新することもできます）。目標設定の
            「実績の取得元」で店舗ごとに<strong>サロンワン切替月</strong>を設定すると、その月から実績が
            サロンワンの値になります。サロンワンで会計を始めた月を設定してください。
          </li>
          <li>
            <strong>マスタ管理</strong>では、メニュー・施術部位・回数券商品・
            カウンセリング項目・同意書テンプレート・スタッフ・LINE定型文などを編集できます。
          </li>
          <li>
            <strong>スタッフの個人情報</strong>（住所・最寄り駅・生年月日・緊急連絡先・口座など）は、
            マスタ管理 ＞ スタッフの各スタッフの「🔒 個人情報」に登録します。管理者だけが見られ、
            スタッフ本人を含めほかの人には表示されません（マイナンバーは入力しないでください）。
          </li>
          <li>これらの経営データはスタッフには表示されません。</li>
        </ul>
      </Section>

      <Section id="payroll" title="月締め・給与と税理士への共有（管理者）">
        <p>
          月末の作業は
          <Link href="/admin/payroll" className="text-gold-dk underline underline-offset-2">
            経営 ＞ 月締め・給与
          </Link>
          で、上から順番に進めます。
        </p>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>
            <strong>勤務実績を確認</strong>：記録漏れがあれば「予定どおりで一括記録」、ずれた日は「日別」で修正します。
          </li>
          <li>
            <strong>給与・報酬を確認</strong>：時給×勤務時間＋交通費で自動計算されます（時給・交通費はシフト管理で設定）。
          </li>
          <li>
            <strong>月を締める</strong>：締めた月のシフト・勤務実績は変更できなくなります（「締めを解除」で戻せます）。
          </li>
          <li>
            <strong>社労士・税理士に送る</strong>：CSVを保存 →「Gmailで作成」で宛先・件名・本文入りのメールを開き、
            CSVを添付して送信します。送付先は同じページの「送付先の設定」に一度登録すれば次回から自動で入ります。
          </li>
          <li>
            <strong>給与明細を配布</strong>：税理士から届いた給与明細（PDF）を
            <Link href="/admin/staff-docs" className="text-gold-dk underline underline-offset-2">
              スタッフ書類
            </Link>
            でまとめてアップロードします。ファイル名にスタッフ名が入っていれば自動で振り分けられます。
          </li>
          <li>
            <strong>業務委託の請求書</strong>：業務委託スタッフが作成・送信した請求書の状況を確認できます。
          </li>
        </ol>
      </Section>

      <Section id="line" title="LINEリッチメニューの設定（管理者向け）">
        <p>
          お客様がLINEからカウンセリングに進めるよう、LINE公式アカウントのリッチメニューに
          リンクを設定します。一度設定すれば、以降はすべてのお客様が同じボタンから利用できます。
        </p>
        <p className="font-semibold text-ink mt-3">設定するURL（ボタンごとに1つずつ）</p>
        <div className="rounded-lg bg-base border border-hairline p-3 text-sm space-y-2">
          <p>
            <span className="text-xs font-semibold text-muted block">「ご予約」ボタン</span>
            <code className="break-all">https://noble1.vercel.app/salons</code>
          </p>
          <p>
            <span className="text-xs font-semibold text-muted block">「カウンセリング」ボタン</span>
            <code className="break-all">https://noble1.vercel.app/f/new</code>
          </p>
        </div>
        <p className="text-xs text-muted">
          ※ 独自ドメインを設定している場合は、そのドメインの <code>/salons</code> ・{" "}
          <code>/f/new</code> を指定してください。
        </p>
        <p className="mt-2">
          「ご予約」ボタンを押すと、
          <Link href="/salons" target="_blank" className="text-gold-dk underline underline-offset-2">
            店舗一覧・ご予約ページ
          </Link>
          が開きます。お客様がその場で店舗（新宿店 / 新宿南口店 / 恵比寿店）を選び、
          地図・道案内・営業時間を確認してネット予約に進めます。掲載内容は{" "}
          <Link href="/admin/stores" className="text-gold-dk underline underline-offset-2">
            経営 &gt; 店舗紹介ページ
          </Link>
          で確認できます（管理者のみ）。
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
            背景画像を設定します（各ボタンの位置に「ご予約」「カウンセリング」などの文字を入れた画像を用意）。
          </li>
          <li>
            「ご予約」のボタン枠を選び、<strong>アクションタイプを「リンク」</strong>にして、
            <code>https://noble1.vercel.app/salons</code> を貼り付けます。
          </li>
          <li>
            同じように「カウンセリング」のボタン枠には{" "}
            <code>https://noble1.vercel.app/f/new</code> を貼り付けます。
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
            <strong>「Gmailで送信」を押してもGmailアプリが開かない</strong>：Gmailアプリが入っていない可能性があります。
            「メールアプリで作成」を使うか、「本文をコピー」してメールに貼り付けてください。
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
