import type { Metadata } from "next";
import "./globals.css";

const BASE_URL = "https://avivo.dev/victory-gt";
const OG_IMAGE = "https://avivo.dev/victory-gt/api/og";
const TITLE = "ויקטורי גני תקווה — מחירון ומבצעים עדכניים | avivo.dev";
const DESCRIPTION =
  "מחירון שקוף ועדכני לסניף ויקטורי גני תקווה. כל המחירים והמבצעים הפעילים, מתעדכן אוטומטית כל 3 שעות ממאגר שקיפות המחירים הרשמי של רשות ההגנה לצרכן ולסחר הוגן.";

export const metadata: Metadata = {
  metadataBase: new URL("https://avivo.dev"),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "ויקטורי גני תקווה",
    "מחירון סופרמרקט",
    "מבצעים גני תקווה",
    "שקיפות מחירים",
    "ויקטורי מחירים",
    "סופרמרקט גני תקווה",
  ],
  authors: [{ name: "Aviv Oron", url: "https://avivo.dev" }],
  creator: "Aviv Oron",
  alternates: {
    canonical: BASE_URL,
  },
  openGraph: {
    type: "website",
    url: BASE_URL,
    title: TITLE,
    description: DESCRIPTION,
    siteName: "ויקטורי גני תקווה מחירון",
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "ויקטורי גני תקווה — מחירון ומבצעים" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
    creator: "@avivOron",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
