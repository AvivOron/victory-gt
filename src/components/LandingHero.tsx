import Link from "next/link";

interface Props {
  productCount: number;
  promoCount: number;
  city: string;
  address: string;
}

export default function LandingHero({ productCount, promoCount, city, address }: Props) {
  const features = [
    "עדכון אוטומטי כל 3 שעות",
    "חיפוש לפי שם מוצר, יצרן או ברקוד",
    "סריקת ברקוד עם המצלמה בנייד",
    "סינון לפי קטגוריה",
    "מבצעים עם פירוט מלא",
    "Recipe Finder — הדביקו קישור למתכון או תארו מנה, וקבלו רשימת קניות מוכנה",
    "מועדפים ורשימת קניות עם Google",
    "התראת מייל כשמוצר מהמועדפים שלך במבצע",
    "עגלה משותפת לבני הבית עם קוד שיתוף",
    "מוצרים שאזלו מהמלאי מוצגים במעומעם עם אזהרת חוסר מלאי",
    "חינמי, ללא פרסומות",
  ];

  return (
    <section className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">

        {/* Hero text */}
        <h1 className="text-2xl font-black leading-tight text-[#171717] sm:text-4xl">
          ויקטורי {city} — מחירון ומבצעים עדכניים
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-600 sm:text-base">
          מחירון שקוף ועדכני לסניף ויקטורי {city}, {address}. הנתונים נשלפים אוטומטית ממאגר שקיפות המחירים של{" "}
          <strong>רשות ההגנה על הצרכן ולסחר הוגן</strong> — כך תמיד תדעו כמה עולה כל מוצר, אילו מבצעים פעילים, אילו פריטים חסרים במלאי, וגם תוכלו לסרוק ברקוד מהנייד או לשתף עגלת קניות עם בני הבית.
        </p>

        {/* Stats */}
        <div className="mt-5 flex flex-wrap gap-3">
          <Stat label="מוצרים" value={productCount.toLocaleString("he-IL")} />
          <Stat label="מבצעים פעילים" value={promoCount.toLocaleString("he-IL")} />
        </div>

        {/* CTA */}
        <Link
          href="/prices"
          className="mt-6 block rounded-lg bg-[#e31837] px-6 py-3 text-center text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#c91530] sm:inline-block sm:text-base"
        >
          לצפייה במחירון ובמבצעים ←
        </Link>

        {/* Feature list */}
        <ul className="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#e31837]/10 text-xs font-black text-[#e31837]">✓</span>
              {f}
            </li>
          ))}
        </ul>

        {/* FAQ */}
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FaqCard
            q="מאיפה מגיעים הנתונים?"
            a="כל המחירים נשלפים ישירות ממאגר שקיפות המחירים הרשמי של ויקטורי, המפורסם מכוח חוק שקיפות מחירי המזון התשע״ד-2014. אין הזנה ידנית."
          />
          <FaqCard
            q="כמה פעמים המחירים מתעדכנים?"
            a="הסורק רץ אוטומטית כל 3 שעות ומושך את הקבצים העדכניים ביותר מהמאגר."
          />
          <FaqCard
            q="איך מוצאים מוצר ספציפי?"
            a="אפשר לחפש לפי שם מוצר, שם יצרן או ברקוד (מק״ט). בנייד אפשר גם לפתוח את סריקת הברקוד, לכוון את המצלמה אל המוצר ולקבל מיד את כרטיס המוצר עם המחיר והמבצעים."
          />
          <FaqCard
            q="מה המשמעות של ״מבצע״?"
            a="מבצעים הם מחירי הנחה מוגדרי זמן שהרשת מדווחת עליהם במאגר, כולל מחיר מבצע, כמות מינימום ותאריך סיום."
          />
          <FaqCard
            q="אפשר לשמור מוצרים לקנייה?"
            a="כן. אחרי התחברות עם Google אפשר לשמור מועדפים, להוסיף מוצרים לרשימת קניות, ולראות מתוך הרשימה אילו פריטים משתתפים כרגע במבצע."
          />
          <FaqCard
            q="אפשר לשתף את הרשימה עם בני הבית?"
            a="כן. לכל משתמש מחובר נוצרת עגלה משותפת עם קוד שיתוף. אפשר להעתיק את הקוד, לשלוח אותו לבני הבית, וכולם רואים ומעדכנים את אותה רשימת קניות."
          />
          <FaqCard
            q="מה קורה אם מוצר לא זמין?"
            a="מוצרים עם `is_available=false` מוצגים במעומעם במחירון וגם בתוך חלון המבצעים. ניסיון להוסיף אותם לרשימת הקניות מציג אזהרה שהמוצר כרגע אזל מהמלאי."
          />
          <FaqCard
            q="האם הנתונים זהים לנתוני החנות?"
            a={`הנתונים משקפים את דיווח הרשת למאגר הממשלתי. ייתכנו פערים זמניים קצרים בין המחיר במדף לבין הדיווח. סניף ויקטורי ${city} נמצא ב-${address}.`}
          />
          <FaqCard
            q="איך מקבלים התראות על מבצעים?"
            a="משתמשים מחוברים עם Google יקבלו אוטומטית מייל כאשר מוצר מהמועדפים שלהם נכנס למבצע. ניתן להסיר את עצמכם מרשימת התפוצה בכל עת דרך הקישור בתחתית המייל."
          />
          <FaqCard
            q="מה זה Recipe Finder?"
            a="לוחצים על כפתור ה-🍳 בראש הדף, מדביקים קישור למתכון או מתארים בחופשיות מה רוצים לבשל — ו-AI מחלץ את הרכיבים ומציג את המוצרים המתאימים מהמלאי עם אפשרות להוסיפם ישירות לרשימת הקניות. אם המתכון נוצר בחינם בפנים, אפשר לשלוח אותו גם למייל."
          />
          <FaqCard
            q="האתר פתוח לכולם?"
            a="כן. האתר חינמי, ללא הרשמה, ללא פרסומות. הוא נבנה כדי לעזור לתושבי גני תקווה לקנות בחוכמה."
          />
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-[#f7f8fa] px-4 py-2 text-center">
      <p className="text-2xl font-black text-[#e31837]">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function FaqCard({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-[#f7f8fa] p-4">
      <h2 className="text-sm font-bold text-[#171717]">{q}</h2>
      <p className="mt-1.5 text-xs leading-relaxed text-gray-600">{a}</p>
    </div>
  );
}
