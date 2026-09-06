import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Orbitron, Zen_Kaku_Gothic_New } from "next/font/google";
import Script from "next/script";
import "./globals.css";

// AdSense のパブリッシャーID（Auto ads。kzkmr.net配下の全アプリ共通方針）
const ADSENSE_CLIENT = "ca-pub-5387424308621149";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// ゲームUI見出し・ロゴ・数値表示用（スタイルガイド「タイポグラフィ」節）
const orbitron = Orbitron({
  variable: "--font-orbitron",
  weight: ["700", "900"],
  subsets: ["latin"],
});

// 説明文・日本語UIラベル用（スタイルガイド「タイポグラフィ」節）
const zenKaku = Zen_Kaku_Gothic_New({
  variable: "--font-zen-kaku",
  weight: ["500", "700"],
  subsets: ["latin"],
});

const title = "ReverseRing";
const description =
  "タップ1つでリング上の自機の周回方向を反転させ、縮んでくる壁の切れ目を通過し続ける無限型リフレックスアクション。";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: title,
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary",
    title,
    description,
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0E14",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} ${orbitron.variable} ${zenKaku.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#0B0E14] overscroll-none">
        {children}
        <Script
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
          crossOrigin="anonymous"
          strategy="beforeInteractive"
        />
      </body>
    </html>
  );
}
