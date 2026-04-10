import { ImageResponse } from "next/og";

export const alt = "ויקטורי גני תקווה — מחירון ומבצעים";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
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
          direction: "rtl",
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

        {/* Decorative shelves pattern */}
        <svg
          style={{ position: "absolute", left: 60, bottom: 40, opacity: 0.06 }}
          width="360"
          height="260"
          viewBox="0 0 360 260"
        >
          {[0, 80, 160].map((y) => (
            <g key={y}>
              <rect x="0" y={y + 30} width="360" height="8" rx="4" fill="#e31837" />
              {[0, 60, 120, 180, 240, 300].map((x) => (
                <rect key={x} x={x + 8} y={y} width="44" height="32" rx="6" fill="#e31837" />
              ))}
            </g>
          ))}
        </svg>

        {/* Main content */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "relative" }}>
          {/* Badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "#e31837", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontWeight: 900, fontSize: 20, display: "flex" }}>V</span>
            </div>
            <span style={{ fontSize: 18, color: "rgba(0,0,0,0.35)", letterSpacing: "0.05em", display: "flex" }}>
              avivo.dev
            </span>
          </div>

          {/* Title */}
          <div style={{ display: "flex", fontSize: 76, fontWeight: 900, color: "#171717", letterSpacing: "-2px", lineHeight: 1 }}>
            <span>ויקטורי&nbsp;</span>
            <span style={{ color: "#e31837" }}>גני תקווה</span>
          </div>

          {/* Subtitle */}
          <div style={{ display: "flex", fontSize: 30, color: "rgba(0,0,0,0.45)", marginTop: 4 }}>
            מחירון ומבצעים עדכניים · נתוני שקיפות מחירים רשמיים
          </div>

          {/* Pills */}
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
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
                {label}
              </div>
            ))}
          </div>

          {/* CTA */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 36 }}>
            <div style={{
              display: "flex",
              padding: "12px 32px",
              borderRadius: 999,
              background: "#e31837",
              fontSize: 22,
              fontWeight: 700,
              color: "#ffffff",
            }}>
              לצפייה במחירון ←
            </div>
            <div style={{ display: "flex", fontSize: 18, color: "rgba(0,0,0,0.25)" }}>
              avivo.dev/victory-gt
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
