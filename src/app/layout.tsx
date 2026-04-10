import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.avivo.dev"),
  title: {
    default: "ויקטורי גני תקווה — מחירון ומבצעים עדכניים לסניף",
    template: "%s | ויקטורי גני תקווה",
  },
  description:
    "מחירון שקוף ועדכני לסניף ויקטורי גני תקווה. כל המחירים והמבצעים הפעילים, מתעדכן אוטומטית כל 3 שעות ממאגר שקיפות המחירים הרשמי של רשות ההגנה לצרכן ולסחר הוגן.",
  keywords: [
    "ויקטורי גני תקווה",
    "מחירון סופרמרקט",
    "מבצעים גני תקווה",
    "שקיפות מחירים",
    "ויקטורי מחירים",
    "סופרמרקט גני תקווה",
  ],
  alternates: {
    canonical: "https://www.avivo.dev/victory-gt",
  },
  openGraph: {
    type: "website",
    locale: "he_IL",
    url: "https://www.avivo.dev/victory-gt",
    siteName: "ויקטורי גני תקווה מחירון",
    title: "ויקטורי גני תקווה — מחירון ומבצעים עדכניים לסניף",
    description:
      "מחירון שקוף ועדכני לסניף ויקטורי גני תקווה. כל המחירים והמבצעים הפעילים, מתעדכן אוטומטית כל 3 שעות ממאגר שקיפות המחירים הרשמי.",
    images: [
      {
        url: "/victory-gt/opengraph-image",
        width: 1200,
        height: 630,
        alt: "ויקטורי גני תקווה — מחירון ומבצעים",
      },
    ],
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
