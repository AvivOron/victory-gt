import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://victory-gt.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "ויקטורי גני תקווה — מחירון ומבצעים",
    template: "%s | ויקטורי גני תקווה",
  },
  description:
    "מחירון עדכני ומבצעים של סניף ויקטורי גני תקווה. נתונים ישירות ממאגר שקיפות המחירים של רשות ההגנה לצרכן ולסחר הוגן.",
  keywords: [
    "ויקטורי גני תקווה",
    "מחירון סופרמרקט",
    "מבצעים גני תקווה",
    "שקיפות מחירים",
    "ויקטורי מחירים",
    "סופרמרקט גני תקווה",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "he_IL",
    url: "/",
    siteName: "ויקטורי גני תקווה מחירון",
    title: "ויקטורי גני תקווה — מחירון ומבצעים",
    description:
      "מחירון עדכני ומבצעים של סניף ויקטורי גני תקווה. נתונים ישירות ממאגר שקיפות המחירים.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
