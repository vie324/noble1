"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Staff, Store } from "@/lib/types";

interface AppContextValue {
  me: Staff;
  stores: Store[];
  isAdmin: boolean;
  isStore: boolean; // 店舗の iPad 用アカウント
  // null = 全店舗合算
  storeFilter: number | null;
  setStoreFilter: (id: number | null) => void;
  storeName: (id: number | null | undefined) => string;
}

const AppContext = createContext<AppContextValue | null>(null);

const FILTER_KEY = "noble.storeFilter";

export function AppProvider({
  me,
  stores,
  children,
}: {
  me: Staff;
  stores: Store[];
  children: React.ReactNode;
}) {
  // 店舗アカウント（iPad）は、最初はその店舗を表示する
  const [storeFilter, setStoreFilterState] = useState<number | null>(
    me.role === "store" ? me.store_id : null
  );

  useEffect(() => {
    const saved = window.localStorage.getItem(FILTER_KEY);
    if (saved && saved !== "all") {
      const id = Number(saved);
      if (stores.some((s) => s.id === id)) setStoreFilterState(id);
    }
  }, [stores]);

  const value = useMemo<AppContextValue>(
    () => ({
      me,
      stores,
      isAdmin: me.role === "admin",
      isStore: me.role === "store",
      storeFilter,
      setStoreFilter: (id) => {
        setStoreFilterState(id);
        window.localStorage.setItem(FILTER_KEY, id === null ? "all" : String(id));
      },
      storeName: (id) =>
        id == null ? "全店舗" : stores.find((s) => s.id === id)?.name ?? "—",
    }),
    [me, stores, storeFilter]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp は AppProvider 配下で使用してください");
  return ctx;
}
