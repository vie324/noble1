import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 認証ガード: セッションの更新と未ログイン時の /login リダイレクト
export async function proxy(request: NextRequest) {
  // Supabase 未設定の間は 500 にせず、セットアップ案内ページへ誘導する
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    if (request.nextUrl.pathname === "/setup") return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/setup";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
  });

  // getUser() はトークンを検証しつつセッションを更新する（getSession より安全）
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 設定済みなら /setup は不要
  if (request.nextUrl.pathname === "/setup") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  const isLoginPage = request.nextUrl.pathname.startsWith("/login");
  // /f/... はお客様向け公開フォーム、/p/... はビフォーアフター公開ページ、
  // /salons... は店舗紹介・ご予約ページ（LINEリッチメニューの遷移先）。いずれも認証不要
  const isPublicPage =
    request.nextUrl.pathname.startsWith("/f/") ||
    request.nextUrl.pathname.startsWith("/p/") ||
    request.nextUrl.pathname === "/salons" ||
    request.nextUrl.pathname.startsWith("/salons/");

  if (!user && !isLoginPage && !isPublicPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // 静的アセット・API（Webhook/iCalフィードは独自に認証）を除く全ルート
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
