import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Noto_Sans_JP, Shippori_Mincho } from "next/font/google";
import "./globals.css";
import { Splash } from "@/components/splash";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

// 日本語の明朝は1つの太さで約120ファイルあり、ビルド時に Google Fonts から取得する。
// 画面で使っているのは 400（標準）と 600（見出しの太字）だけなので、500 は読み込まない
// （取得するファイルが約4分の1減り、Vercel でのビルド失敗が起きにくくなる）
const shippori = Shippori_Mincho({
  variable: "--font-shippori",
  weight: ["400", "600"],
  subsets: ["latin"],
  preload: false,
});

const notoSans = Noto_Sans_JP({
  variable: "--font-noto-sans",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: "Noble | ノーブル業務システム",
  description: "エステサロン ノーブルの業務統合システム",
  manifest: "/manifest.webmanifest",
  icons: {
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Noble",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FBF8F3",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${cormorant.variable} ${shippori.variable} ${notoSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Splash />
        {children}
      </body>
    </html>
  );
}
