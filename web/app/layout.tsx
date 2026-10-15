import type { Metadata, Viewport } from "next";
import "./fonts.css";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ayiko.ai";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Ayiko.ai · AI video in Twi, Yoruba, Pidgin and more",
  description:
    "Describe it, add a photo, pick a language. Ayiko makes ready-to-post videos with natural voiceovers and captions in Twi, Yoruba, Pidgin, Hausa, English and more.",
  openGraph: {
    title: "Ayiko.ai · Make the video. Speak their language.",
    description: "AI product videos with voiceovers in African languages and English. Join the private beta.",
    url: siteUrl,
    siteName: "Ayiko.ai",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Ayiko.ai", description: "AI video in the languages other tools ignore." },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#07070D" },
    { media: "(prefers-color-scheme: light)", color: "#F4F5FA" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preload" href="/fonts/inter-tight-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {/* Apply a theme chosen in Settings before first paint, so there's no flash. */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("ayiko-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
