import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Product } from "@/lib/db";

const BRANCH = process.env.GANEI_TIKVA_BRANCH_ID || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
  const data: GeminiResponse = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function fetchUrlText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; RecipeBot/1.0)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status}`);
  const html = await res.text();
  // Strip tags, collapse whitespace
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6000);
  return text;
}

export async function POST(req: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  const body = await req.json() as { url?: string; text?: string };
  const { url, text } = body;

  if (!url && !text) {
    return NextResponse.json({ error: "Provide url or text" }, { status: 400 });
  }

  let recipeContent = text ?? "";
  const isFreeText = !url && !!text;
  if (url) {
    try {
      const fetched = await fetchUrlText(url);
      recipeContent = fetched + (text ? `\n\n${text}` : "");
    } catch (e) {
      return NextResponse.json({ error: `Could not fetch URL: ${e instanceof Error ? e.message : String(e)}` }, { status: 400 });
    }
  }

  const CATEGORIES = "פירות וירקות, חלב ביצים ומעדנים, מזווה ובישול, בשר עוף ודגים, מאפייה ולחמים, קפואים, משקאות, חטיפים ומתוקים, אחר";

  const ingredientInstructions = `Use the most specific Hebrew term that will match a supermarket product name — e.g. "פלפל שחור טחון" not "פלפל", "שמן קנולה" not "שמן", "בצל לבן" not "בצל", "קמח חיטה" not "קמח".
The term should match how the product is named on a supermarket shelf, so it starts with the main ingredient word.
Strip preparation adjectives that describe how the ingredient is prepared in the recipe but don't appear on product packaging — e.g. use "שומשום" not "שומשום קלוי", "שקדים" not "שקדים קצוצים", "גבינה" not "גבינה מגוררת".
Assign the correct category from the list above.`;

  // For free-text requests, generate a recipe and extract ingredients in one call
  const extractPrompt = isFreeText
    ? `You are a helpful cooking assistant. The user described a dish or meal: "${recipeContent}"
Write a full recipe in Hebrew using Markdown formatting, then list the main grocery ingredients.
Available supermarket categories: ${CATEGORIES}

${ingredientInstructions}

The recipe should include:
- A # heading with the dish name
- ## רכיבים section with a bullet list of ingredients with exact quantities (e.g. "- 3 ביצים גדולות", "- 200 גר שוקולד מריר 70%")
- ## הכנה section with numbered steps, each with enough detail to actually cook the dish
- Aim for a complete, useful recipe (150-300 words)

Return a JSON object with exactly two keys — put "ingredients" FIRST, then "recipe":
- "ingredients": an array of objects, each with "term" and "category"
- "recipe": the full Markdown recipe string

Example: {"ingredients":[{"term":"שוקולד מריר","category":"מזווה ובישול"},{"term":"ביצים","category":"חלב ביצים ומעדנים"}],"recipe":"# עוגת שוקולד\\n## רכיבים\\n- 200 גר שוקולד מריר\\n..."}
Return ONLY the raw JSON object, no markdown fences, no other text.`
    : `You are a grocery shopping assistant for an Israeli supermarket.
Given the following recipe content, extract the main grocery ingredients.
Available supermarket categories: ${CATEGORIES}

${ingredientInstructions}

Return ONLY a JSON array of objects, each with "term" and "category".
Example: [{"term":"עגבניות","category":"פירות וירקות"},{"term":"גבינה צהובה 28%","category":"חלב ביצים ומעדנים"},{"term":"שמן זית","category":"מזווה ובישול"}]
Include 5-15 ingredients. Skip basic pantry items like salt/oil unless prominent.

Recipe content:
${recipeContent}`;

  interface IngredientHint { term: string; category: string | null; }
  let ingredientHints: IngredientHint[] = [];
  let generatedRecipe: string | null = null;
  try {
    const raw = await callGemini(extractPrompt);
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    const parseHints = (arr: unknown): IngredientHint[] => {
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((x): x is { term: unknown; category: unknown } => typeof x === "object" && x !== null)
        .map(x => ({ term: String(x.term ?? ""), category: typeof x.category === "string" ? x.category : null }))
        .filter(x => x.term.length > 0)
        .slice(0, 15);
    };

    if (isFreeText) {
      // Try clean JSON.parse first
      let parsed: { ingredients?: unknown; recipe?: unknown } | null = null;
      try { parsed = JSON.parse(cleaned) as { ingredients?: unknown; recipe?: unknown }; } catch { /* fall through */ }

      if (parsed) {
        ingredientHints = parseHints(parsed.ingredients);
        if (typeof parsed.recipe === "string" && parsed.recipe.length > 20) generatedRecipe = parsed.recipe;
      } else {
        // Fallback: extract ingredients array by position
        const ingKey = cleaned.indexOf('"ingredients"');
        if (ingKey !== -1) {
          const arrStart = cleaned.indexOf("[", ingKey);
          const arrEnd = cleaned.indexOf("]", arrStart);
          if (arrStart !== -1 && arrEnd !== -1) {
            try { ingredientHints = parseHints(JSON.parse(cleaned.slice(arrStart, arrEnd + 1))); } catch { /* ignore */ }
          }
        }
        // Fallback: extract recipe string char-by-char
        const recipeKey = cleaned.indexOf('"recipe"');
        if (recipeKey !== -1) {
          const colon = cleaned.indexOf(":", recipeKey);
          const strStart = cleaned.indexOf('"', colon + 1);
          if (strStart !== -1) {
            let pos = strStart + 1;
            let recipeStr = "";
            while (pos < cleaned.length) {
              const ch = cleaned[pos];
              if (ch === "\\" && pos + 1 < cleaned.length) {
                const next = cleaned[pos + 1];
                if (next === "n") recipeStr += "\n";
                else if (next === "t") recipeStr += "\t";
                else recipeStr += next;
                pos += 2;
              } else if (ch === '"') {
                break;
              } else {
                recipeStr += ch;
                pos++;
              }
            }
            if (recipeStr.length > 20) generatedRecipe = recipeStr;
          }
        }
      }
    } else {
      const arrStart = cleaned.indexOf("[");
      const arrEnd = cleaned.lastIndexOf("]");
      if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
        ingredientHints = parseHints(JSON.parse(cleaned.slice(arrStart, arrEnd + 1)));
      }
    }
  } catch (e) {
    return NextResponse.json({ error: `Gemini failed: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }

  const ingredients = ingredientHints.map(h => h.term);

  if (ingredients.length === 0) {
    return NextResponse.json({ error: "Could not extract ingredients from recipe" }, { status: 422 });
  }

  // For each ingredient, find the best matching product from DB.
  // Strategy: fetch up to 30 candidates that contain ANY ingredient token, then
  // score locally — products whose item_name contains ALL tokens score highest,
  // tiebreak by price. This avoids returning e.g. "פריכיות פלפל שחור" for "פלפל שחור".
  const results: Array<{ ingredient: string; product: Product | null; alternatives: Product[] }> = [];

  await Promise.all(
    ingredientHints.map(async ({ term: ingredient, category: categoryHint }) => {
      const normalize = (s: string) => s.replace(/יי/g, "י").replace(/וו/g, "ו");
      const tokens = ingredient.trim().split(/\s+/).filter(Boolean);
      // Each token gets up to 2 search variants: original + normalized (deduped)
      const tokenVariants = tokens.map(t => Array.from(new Set([t, normalize(t)])));
      if (tokens.length === 0) { results.push({ ingredient, product: null, alternatives: [] }); return; }

      const buildConditions = (withCategory: boolean) => {
        const conds: string[] = [];
        const args: (string | number)[] = [];
        if (BRANCH) { conds.push("branch_id = ?"); args.push(BRANCH); }
        conds.push("COALESCE(is_available, TRUE) = TRUE");
        if (withCategory && categoryHint) { conds.push("category = ?"); args.push(categoryHint); }
        // Each token: item_name must match at least one variant
        for (const variants of tokenVariants) {
          conds.push(`(${variants.map(() => "item_name LIKE ?").join(" OR ")})`);
          args.push(...variants.map(v => `%${v}%`));
        }
        return { conds, args };
      };

      const query = (conds: string[], args: (string | number)[]) => db.execute({
        sql: `SELECT item_code,item_name,item_price,unit_of_measure,quantity,category,manufacturer_name,branch_id,last_updated,COALESCE(is_available,TRUE) as is_available
              FROM products WHERE ${conds.join(" AND ")} ORDER BY item_price ASC LIMIT 30`,
        args,
      });

      try {
        let rows: Product[] = [];

        // Try 1: all tokens + category filter
        if (categoryHint) {
          const { conds, args } = buildConditions(true);
          rows = (await query(conds, args)).rows as unknown as Product[];
        }

        // Try 2: all tokens, no category filter
        if (rows.length === 0) {
          const { conds, args } = buildConditions(false);
          rows = (await query(conds, args)).rows as unknown as Product[];
        }

        // Try 3: first token only + category (modifier words like "קלוי" may not appear in product names)
        if (rows.length === 0) {
          const conds: string[] = [];
          const args: (string | number)[] = [];
          if (BRANCH) { conds.push("branch_id = ?"); args.push(BRANCH); }
          conds.push("COALESCE(is_available, TRUE) = TRUE");
          if (categoryHint) { conds.push("category = ?"); args.push(categoryHint); }
          const v0 = tokenVariants[0];
          conds.push(`(${v0.map(() => "item_name LIKE ?").join(" OR ")})`);
          args.push(...v0.map(v => `%${v}%`));
          rows = (await query(conds, args)).rows as unknown as Product[];
        }

        // Try 4: first token, no category
        if (rows.length === 0) {
          const conds: string[] = [];
          const args: (string | number)[] = [];
          if (BRANCH) { conds.push("branch_id = ?"); args.push(BRANCH); }
          conds.push("COALESCE(is_available, TRUE) = TRUE");
          const v0 = tokenVariants[0];
          conds.push(`(${v0.map(() => "item_name LIKE ?").join(" OR ")})`);
          args.push(...v0.map(v => `%${v}%`));
          rows = (await query(conds, args)).rows as unknown as Product[];
        }

        if (rows.length === 0) { results.push({ ingredient, product: null, alternatives: [] }); return; }

        // Normalize Hebrew spelling variants: יי→י, double-yod, etc.
        // Score: reward name-start match heavily, whole-word moderately, category match bonus
        const score = (p: Product) => {
          const n = normalize(p.item_name);
          let s = tokens.reduce((acc, t) => {
            const nt = normalize(t);
            const startsWithToken = new RegExp(`^${nt}(\\s|$)`).test(n);
            const wholeWord = new RegExp(`(^|\\s)${nt}(\\s|$)`).test(n);
            return acc + (startsWithToken ? 6 : wholeWord ? 3 : n.includes(nt) ? 1 : 0);
          }, 0);
          if (categoryHint && p.category === categoryHint) s += 2;
          return s;
        };

        // Sort all rows by score desc, price asc
        const sorted = [...rows].sort((a, b) => {
          const sd = score(b) - score(a);
          return sd !== 0 ? sd : a.item_price - b.item_price;
        });

        const best = sorted[0];
        const alternatives = sorted.slice(1, 6); // up to 5 alternatives

        results.push({ ingredient, product: best, alternatives });
      } catch {
        results.push({ ingredient, product: null, alternatives: [] });
      }
    })
  );

  // Sort: matched first (by price), unmatched last
  const matched = results.filter(r => r.product !== null).sort((a, b) => (a.product!.item_price - b.product!.item_price));
  const unmatched = results.filter(r => r.product === null);

  return NextResponse.json({ results: [...matched, ...unmatched], ingredients, recipe: generatedRecipe });
}
