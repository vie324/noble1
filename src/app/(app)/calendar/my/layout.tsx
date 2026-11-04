import { redirectStoreAccount } from "@/lib/supabase/guard";

// マイシフトは本人用。店舗アカウント（iPad）では開けない
export default async function MyShiftLayout({ children }: { children: React.ReactNode }) {
  await redirectStoreAccount("/calendar");
  return <>{children}</>;
}
