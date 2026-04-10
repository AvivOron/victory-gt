import { db, type Branch } from "@/lib/db";
import PriceTable from "@/components/PriceTable";
import Header from "@/components/Header";
import type { Metadata } from "next";

export const revalidate = 10800;

export const metadata: Metadata = {
  title: "מחירון ומבצעים",
  alternates: { canonical: "/prices" },
};

const BRANCH = process.env.GANEI_TIKVA_BRANCH_ID || "";

async function getStats() {
  try {
    const branchArg = BRANCH ? [BRANCH] : [];
    const where = BRANCH ? "WHERE branch_id = ?" : "";
    const [pc, prc, lu] = await Promise.all([
      db.execute({ sql: `SELECT COUNT(*) as c FROM products ${where}`, args: branchArg }),
      db.execute({ sql: `SELECT COUNT(*) as c FROM promos ${where}`, args: branchArg }),
      db.execute({ sql: `SELECT last_updated FROM products ${where} LIMIT 1`, args: branchArg }),
    ]);
    return {
      productCount: Number(pc.rows[0]?.c ?? 0),
      promoCount: Number(prc.rows[0]?.c ?? 0),
      lastUpdated: (lu.rows[0]?.last_updated as string) ?? null,
    };
  } catch { return { productCount: 0, promoCount: 0, lastUpdated: null }; }
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

export default async function PricesPage() {
  const [stats, branch] = await Promise.all([getStats(), getBranch()]);

  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      <Header branch={branch} lastUpdated={stats.lastUpdated} />
      <PriceTable productCount={stats.productCount} promoCount={stats.promoCount} />
    </div>
  );
}
