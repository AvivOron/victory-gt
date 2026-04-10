import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ויקטורי גני תקווה — מחירון",
  description: "מחירים ומבצעים ממאגר שקיפות המחירים — ויקטורי גני תקווה",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
