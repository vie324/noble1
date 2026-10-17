import { addMonths, thisMonthJST } from "@/lib/format";
import { importSalonOneMonths, salonOneErrorMessage } from "@/lib/salonone";

export const dynamic = "force-dynamic";

// サロンワンの売上・新規数の定期取り込み（Vercel Cron から毎朝呼ばれる。vercel.json 参照）
//   対象: 前月と当月（月初数日に前月分が修正されても反映されるように前月も取り直す）
//   認証: Vercel Cron が付ける Authorization: Bearer <CRON_SECRET>。CRON_SECRET 未設定時は無効
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const month = thisMonthJST();
  try {
    const result = await importSalonOneMonths(addMonths(month, -1), month);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    console.error("[salonone sync]", e);
    return Response.json({ ok: false, message: salonOneErrorMessage(e) }, { status: 502 });
  }
}
