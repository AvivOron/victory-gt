import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";

function markdownToHtml(md: string): string {
  return md
    .replace(/^# (.+)$/gm, "<h1 style='margin:0 0 12px;font-size:22px;color:#171717'>$1</h1>")
    .replace(/^## (.+)$/gm, "<h2 style='margin:16px 0 8px;font-size:16px;color:#171717'>$1</h2>")
    .replace(/^### (.+)$/gm, "<h3 style='margin:12px 0 6px;font-size:14px;color:#171717'>$1</h3>")
    .replace(/^\d+\. (.+)$/gm, "<li style='margin-bottom:6px'>$1</li>")
    .replace(/^- (.+)$/gm, "<li style='margin-bottom:4px'>$1</li>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n{2,}/g, "</p><p style='margin:8px 0'>")
    .replace(/\n/g, "<br>");
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { recipe, title } = await req.json() as { recipe?: string; title?: string };
  if (!recipe) return NextResponse.json({ error: "No recipe provided" }, { status: 400 });

  const recipeTitle = title ?? "מתכון מויקטורי";
  const bodyHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;direction:rtl;text-align:right">
      <div style="background:#e31837;padding:12px 20px;border-radius:8px 8px 0 0">
        <span style="color:white;font-size:20px;font-weight:bold">🍳 ${recipeTitle}</span>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:20px;background:#fff">
        ${markdownToHtml(recipe)}
      </div>
      <p style="margin-top:16px;font-size:12px;color:#9ca3af;text-align:center">
        נשלח מ<a href="https://avivo.dev/victory-gt/prices" style="color:#e31837">ויקטורי גני תקווה מחירון</a>
      </p>
    </div>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "recipe@avivo.dev",
      to: session.user.email,
      subject: `🍳 ${recipeTitle}`,
      html: bodyHtml,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `Failed to send email: ${err}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
