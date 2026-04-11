import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOrCreateCurrentHousehold, getSessionUser } from "@/lib/households";

const BRANCH = process.env.GANEI_TIKVA_BRANCH_ID || "";

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = getSessionUser(session);

  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const household = await getOrCreateCurrentHousehold(user);

  const result = await db.execute({
    sql: `SELECT item_code, item_name, item_price, category, quantity, checked
          FROM shopping_list_items WHERE household_id = ? ORDER BY created_at ASC`,
    args: [household.householdId],
  });

  const items = result.rows.map(row => ({
    item_code: String(row.item_code ?? ""),
    item_name: String(row.item_name ?? ""),
    item_price: Number(row.item_price ?? 0),
    quantity: Number(row.quantity ?? 1),
    checked: row.checked === 1 || row.checked === true,
    category: row.category == null ? null : String(row.category),
    promo_label: null as string | null,
  }));

  // Fetch category and active promo metadata for cart item codes.
  if (items.length > 0) {
    const itemCodes = items.map(i => i.item_code);
    const placeholders = itemCodes.map(() => "?").join(",");
    const productConditions = [`item_code IN (${placeholders})`];
    const productArgs: string[] = [...itemCodes];
    if (BRANCH) {
      productConditions.push("branch_id = ?");
      productArgs.push(BRANCH);
    }
    const productResult = await db.execute({
      sql: `SELECT item_code, category FROM products WHERE ${productConditions.join(" AND ")}`,
      args: productArgs,
    });
    const categoryByCode = new Map<string, string | null>();
    for (const row of productResult.rows) {
      categoryByCode.set(
        String(row.item_code ?? ""),
        row.category == null ? null : String(row.category)
      );
    }
    for (const item of items) {
      item.category = categoryByCode.get(item.item_code) ?? item.category ?? null;
    }

    const conditions = itemCodes.map(() => "item_codes LIKE ?").join(" OR ");
    const args: string[] = itemCodes.map(code => `%"${code}"%`);
    if (BRANCH) args.push(BRANCH);
    const promoResult = await db.execute({
      sql: `SELECT description, item_codes FROM promos WHERE (${conditions})${BRANCH ? " AND branch_id = ?" : ""}`,
      args,
    });
    const promosByCode = new Map<string, string[]>();
    for (const row of promoResult.rows) {
      const desc = String(row.description ?? "").trim();
      if (!desc) continue;
      let codes: string[] = [];
      try { codes = JSON.parse(String(row.item_codes ?? "[]")); } catch { continue; }
      for (const code of codes) {
        if (!promosByCode.has(code)) promosByCode.set(code, []);
        promosByCode.get(code)!.push(desc);
      }
    }
    for (const item of items) {
      const labels = promosByCode.get(item.item_code);
      if (labels?.length) item.promo_label = labels.join(" · ");
    }
  }

  return Response.json({ items });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const user = getSessionUser(session);

  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const household = await getOrCreateCurrentHousehold(user);

  const body = await request.json().catch(() => null) as {
    itemCode?: unknown; itemName?: unknown; itemPrice?: unknown; itemCategory?: unknown;
  } | null;

  const itemCode = typeof body?.itemCode === "string" ? body.itemCode.trim() : "";
  const itemName = typeof body?.itemName === "string" ? body.itemName.trim() : "";
  const itemPrice = typeof body?.itemPrice === "number" ? body.itemPrice : 0;
  const itemCategory = typeof body?.itemCategory === "string" ? body.itemCategory.trim() : "";

  if (!itemCode) {
    return Response.json({ error: "itemCode is required" }, { status: 400 });
  }

  await db.execute({
    sql: `INSERT INTO shopping_list_items (household_id, item_code, item_name, item_price, category, quantity, checked, added_by_user_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (household_id, item_code) DO UPDATE SET
            item_name = EXCLUDED.item_name,
            item_price = EXCLUDED.item_price,
            category = COALESCE(EXCLUDED.category, shopping_list_items.category),
            quantity = shopping_list_items.quantity + 1,
            checked = 0,
            updated_at = CURRENT_TIMESTAMP`,
    args: [household.householdId, itemCode, itemName, itemPrice, itemCategory || null, user.userId],
  });

  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  const user = getSessionUser(session);

  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const household = await getOrCreateCurrentHousehold(user);

  const body = await request.json().catch(() => null) as { itemCode?: unknown; force?: unknown } | null;
  const itemCode = typeof body?.itemCode === "string" ? body.itemCode.trim() : "";
  const force = body?.force === true;

  if (!itemCode) {
    return Response.json({ error: "itemCode is required" }, { status: 400 });
  }

  if (force) {
    await db.execute({
      sql: "DELETE FROM shopping_list_items WHERE household_id = ? AND item_code = ?",
      args: [household.householdId, itemCode],
    });
  } else {
    await db.execute({
      sql: `UPDATE shopping_list_items SET quantity = quantity - 1, updated_at = CURRENT_TIMESTAMP WHERE household_id = ? AND item_code = ?`,
      args: [household.householdId, itemCode],
    });
    await db.execute({
      sql: "DELETE FROM shopping_list_items WHERE household_id = ? AND item_code = ? AND quantity <= 0",
      args: [household.householdId, itemCode],
    });
  }

  return Response.json({ ok: true });
}

// PATCH: toggle checked state
export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  const user = getSessionUser(session);

  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const household = await getOrCreateCurrentHousehold(user);

  const body = await request.json().catch(() => null) as {
    itemCode?: unknown; checked?: unknown;
  } | null;

  const itemCode = typeof body?.itemCode === "string" ? body.itemCode.trim() : "";
  const checked = body?.checked === true ? 1 : 0;

  if (!itemCode) {
    return Response.json({ error: "itemCode is required" }, { status: 400 });
  }

  await db.execute({
    sql: "UPDATE shopping_list_items SET checked = ?, updated_at = CURRENT_TIMESTAMP WHERE household_id = ? AND item_code = ?",
    args: [checked, household.householdId, itemCode],
  });

  return Response.json({ ok: true });
}
