import { redirectStoreAccount } from "@/lib/supabase/guard";

// マイ書類・請求書は本人用。店舗アカウント（iPad）では開けない
export default async function MyLayout({ children }: { children: React.ReactNode }) {
  await redirectStoreAccount("/");
  return <>{children}</>;
}
