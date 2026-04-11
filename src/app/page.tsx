import { db, type Branch } from "@/lib/db";
import LandingHero from "@/components/LandingHero";
import Link from "next/link";

export const revalidate = 10800;

const BRANCH = process.env.GANEI_TIKVA_BRANCH_ID || "";

async function getStats() {
  try {
    const branchArg = BRANCH ? [BRANCH] : [];
    const where = BRANCH ? "WHERE branch_id = ?" : "";
    const [pc, prc] = await Promise.all([
      db.execute({ sql: `SELECT COUNT(*) as c FROM products ${where}`, args: branchArg }),
      db.execute({ sql: `SELECT COUNT(*) as c FROM promos ${where}`, args: branchArg }),
    ]);
    return {
      productCount: Number(pc.rows[0]?.c ?? 0),
      promoCount: Number(prc.rows[0]?.c ?? 0),
    };
  } catch { return { productCount: 0, promoCount: 0 }; }
}

async function getBranch(): Promise<Branch | null> {
  if (!BRANCH) return null;
  try {
    const result = await db.execute({
      sql: "SELECT * FROM branches WHERE branch_id = ? LIMIT 1",
      args: [BRANCH],
    });
    return result.rows[0] ? ({ ...result.rows[0] } as unknown as Branch) : null;
  } catch { return null; }
}

export default async function HomePage() {
  const [stats, branch] = await Promise.all([getStats(), getBranch()]);

  const city = branch?.city || "גני תקווה";
  const address = branch?.address || "רחוב הכרמל 20, גני תקווה";

  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      {/* Minimal nav */}
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#e31837] text-lg font-black text-white shadow-sm">
            V
          </div>
          <span className="font-bold text-[#171717]">ויקטורי {city}</span>
          <div className="flex-1" />
          <Link
            href="/prices"
            className="rounded-lg bg-[#e31837] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#c91530]"
          >
            למחירון ←
          </Link>
        </div>
      </nav>

      <LandingHero
        productCount={stats.productCount}
        promoCount={stats.promoCount}
        city={city}
        address={address}
      />

      {/* CTA */}
      <div className="border-t border-gray-200 bg-white px-4 py-10 text-center sm:py-14">
        <p className="text-lg font-bold text-[#171717]">מוכנים לבדוק מחירים?</p>
        <p className="mt-1 text-sm text-gray-500">כל המוצרים והמבצעים של ויקטורי {city}, כולל סריקת ברקוד ועגלה משותפת למשק הבית</p>
        <Link
          href="/prices"
          className="mt-5 block rounded-lg bg-[#e31837] px-8 py-3 text-base font-bold text-white shadow-sm transition-colors hover:bg-[#c91530] sm:inline-block"
        >
          לצפייה במחירון ובמבצעים
        </Link>
      </div>
    </div>
  );
}
