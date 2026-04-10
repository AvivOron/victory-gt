import type { Branch } from "@/lib/db";

interface Props {
  branch: Branch | null;
  lastUpdated: string | null;
  productCount: number;
  promoCount: number;
}

export default function Header({ branch, lastUpdated, productCount, promoCount }: Props) {
  const city = branch?.city || "גני תקווה";
  const address = branch?.address || "רחוב הכרמל 20, גני תקווה";

  const updatedStr = lastUpdated
    ? new Date(lastUpdated).toLocaleString("he-IL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <header
      className="text-white px-8 py-5 flex items-center gap-4 shadow-md"
      style={{ background: "linear-gradient(135deg, #e31837 0%, #c0392b 100%)" }}
    >
      <div
        className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-xl font-black flex-shrink-0"
        style={{ color: "#e31837" }}
      >
        V
      </div>
      <div className="flex-1 min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold leading-tight">
          ויקטורי {city} — מחירון
        </h1>
        <p className="text-sm opacity-85 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
          <span>{address}</span>
          {updatedStr && <span className="opacity-70">עודכן: {updatedStr}</span>}
        </p>
        <p className="text-xs opacity-75 mt-1 flex gap-3">
          <span>{productCount.toLocaleString()} מוצרים</span>
          <span>·</span>
          <span>{promoCount.toLocaleString()} מבצעים</span>
        </p>
      </div>
      <div className="hidden sm:block mr-auto text-xs opacity-60 text-left flex-shrink-0" dir="ltr">
        מאגר שקיפות המחירים
        <br />
        רשות ההגנה לצרכן
      </div>
    </header>
  );
}
