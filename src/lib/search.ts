// 顧客検索の条件（名前・カナ・電話番号の部分一致）
//   ・カナ欄はカタカナで登録されているため、スマホのひらがな入力（やまだ）でもヤマダに一致させる
//   ・電話番号は「090-1234」のようにハイフン・空白入りで打っても一致させる
//   ・PostgREST の or 条件を壊す文字（, ( ) " \ * %）は取り除く

export function toKatakana(s: string): string {
  return s.replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

// supabase の .or() にそのまま渡せる文字列。検索語が空なら null
export function customerSearchFilter(q: string): string | null {
  const term = q.replace(/[,()"\\*%]/g, " ").trim();
  if (!term) return null;
  const conds = new Set<string>([
    `name.ilike.%${term}%`,
    `kana.ilike.%${toKatakana(term)}%`,
    `phone.ilike.%${term}%`,
  ]);
  const digits = term.replace(/[\s\-‐－ー()]/g, "");
  if (/^\d{2,}$/.test(digits) && digits !== term) conds.add(`phone.ilike.%${digits}%`);
  return [...conds].join(",");
}
