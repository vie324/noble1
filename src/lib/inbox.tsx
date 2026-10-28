"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";

// ログイン中のスタッフへのお知らせ（未読の書類・請求書の作成待ち）
//   メニューのバッジと「今日」画面のお知らせに使う。画面遷移のたびに更新
interface Inbox {
  unreadDocuments: number;
  // 業務委託: 作成・送信が済んでいない締め済みの月（"YYYY-MM-01"）。なければ null
  invoiceMonth: string | null;
  invoiceState: "create" | "send" | null;
  refresh: () => void;
}

const InboxContext = createContext<Inbox>({
  unreadDocuments: 0,
  invoiceMonth: null,
  invoiceState: null,
  refresh: () => {},
});

export function InboxProvider({ children }: { children: React.ReactNode }) {
  const { me } = useApp();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [unreadDocuments, setUnread] = useState(0);
  const [invoiceMonth, setInvoiceMonth] = useState<string | null>(null);
  const [invoiceState, setInvoiceState] = useState<Inbox["invoiceState"]>(null);

  const refresh = useCallback(async () => {
    const docs = await supabase
      .from("staff_documents")
      .select("id", { count: "exact", head: true })
      .eq("staff_id", me.id)
      .is("viewed_at", null);
    setUnread(docs.count ?? 0);

    if (me.employment_type !== "contractor") return;
    const { data: closing } = await supabase
      .from("payroll_closings")
      .select("month")
      .order("month", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!closing) {
      setInvoiceMonth(null);
      setInvoiceState(null);
      return;
    }
    const { data: invoice } = await supabase
      .from("contractor_invoices")
      .select("id, sent_at")
      .eq("staff_id", me.id)
      .eq("month", closing.month)
      .maybeSingle();
    const state = !invoice ? "create" : invoice.sent_at ? null : "send";
    setInvoiceMonth(state ? closing.month : null);
    setInvoiceState(state);
  }, [supabase, me.id, me.employment_type]);

  useEffect(() => {
    refresh();
  }, [refresh, pathname]);

  const value = useMemo(
    () => ({ unreadDocuments, invoiceMonth, invoiceState, refresh }),
    [unreadDocuments, invoiceMonth, invoiceState, refresh]
  );
  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
}

export function useInbox(): Inbox {
  return useContext(InboxContext);
}
