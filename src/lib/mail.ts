// メール作成画面を開くリンク（Gmail アプリ／ブラウザの Gmail／標準のメールアプリ）
//   添付ファイルは付けられないため、本文に要点とリンクを入れて送る

export interface MailDraft {
  to: string;
  cc?: string | null;
  subject: string;
  body: string;
}

const enc = encodeURIComponent;

// ブラウザの Gmail（PC 向け）
export function gmailWebUrl(d: MailDraft): string {
  const q = [`view=cm`, `fs=1`, `to=${enc(d.to)}`, `su=${enc(d.subject)}`, `body=${enc(d.body)}`];
  if (d.cc) q.push(`cc=${enc(d.cc)}`);
  return `https://mail.google.com/mail/?${q.join("&")}`;
}

// iPhone の Gmail アプリ（インストール済みの場合）
export function gmailIosAppUrl(d: MailDraft): string {
  const q = [`to=${enc(d.to)}`, `subject=${enc(d.subject)}`, `body=${enc(d.body)}`];
  if (d.cc) q.push(`cc=${enc(d.cc)}`);
  return `googlegmail://co?${q.join("&")}`;
}

// 標準のメールアプリ（Android は通常 Gmail が開く）
export function mailtoUrl(d: MailDraft): string {
  const q = [`subject=${enc(d.subject)}`, `body=${enc(d.body)}`];
  if (d.cc) q.push(`cc=${enc(d.cc)}`);
  return `mailto:${d.to}?${q.join("&")}`;
}
