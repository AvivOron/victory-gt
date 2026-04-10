import { ImageResponse } from "next/og";

export const runtime = "edge";

function rev(s: string) {
  return [...s].reverse().join("");
}

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: "#ffffff",
          padding: "72px 80px",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Red glow */}
        <div
          style={{
            position: "absolute",
            width: 700,
            height: 700,
            borderRadius: "50%",
            background: "rgba(227,24,55,0.07)",
            filter: "blur(120px)",
            top: "50%",
            right: "20%",
            transform: "translate(50%, -50%)",
            display: "flex",
          }}
        />

        {/* Main content */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 16, position: "relative" }}>
          {/* Badge */}
          <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "#e31837", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontWeight: 900, fontSize: 20, display: "flex" }}>V</span>
            </div>
            <span style={{ fontSize: 18, color: "rgba(0,0,0,0.35)", letterSpacing: "0.05em", display: "flex" }}>
              avivo.dev
            </span>
          </div>

          {/* Title */}
          <div style={{ display: "flex", flexDirection: "row-reverse", fontSize: 76, fontWeight: 900, color: "#171717", letterSpacing: "-2px", lineHeight: 1 }}>
            <span>{rev("ויקטורי\u00a0")}</span>
            <span style={{ color: "#e31837" }}>{rev("גני תקווה")}</span>
          </div>

          {/* Subtitle */}
          <div style={{ display: "flex", fontSize: 30, color: "rgba(0,0,0,0.45)", marginTop: 4 }}>
            {rev("מחירון ומבצעים עדכניים · נתוני שקיפות מחירים רשמיים")}
          </div>

          {/* Pills */}
          <div style={{ display: "flex", flexDirection: "row-reverse", gap: 12, marginTop: 24 }}>
            {["עדכון כל 3 שעות", "מבצעים פעילים", "חינמי"].map((label) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  padding: "8px 22px",
                  borderRadius: 999,
                  border: "1px solid rgba(227,24,55,0.25)",
                  background: "rgba(227,24,55,0.06)",
                  fontSize: 20,
                  color: "#e31837",
                }}
              >
                {rev(label)}
              </div>
            ))}
          </div>

          {/* CTA */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 36 }}>
            <div style={{
              display: "flex",
              padding: "14px 36px",
              borderRadius: 999,
              background: "#e31837",
              fontSize: 24,
              fontWeight: 800,
              color: "#ffffff",
              letterSpacing: "-0.3px",
            }}>
              {rev("← בדוק מחירים עכשיו בחינם")}
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 18, color: "rgba(0,0,0,0.3)", marginTop: 12 }}>
            avivo.dev/victory-gt
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
