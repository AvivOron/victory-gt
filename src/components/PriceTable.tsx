"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import type { Product, Promo } from "@/lib/db";

type Tab = "prices" | "promos";
type SortCol = "item_name" | "item_price" | "manufacturer_name" | "item_code";
type SortDir = "asc" | "desc";
type PromoSort = "latest" | "biggest_discount";
const PAGE_SIZE = 20;

interface ProductsResponse {
  products: Product[];
  total: number;
  promoTotal: number | null;
  page: number;
  pages: number;
}

interface PromosResponse {
  promos: Promo[];
  total: number;
  productTotal: number | null;
  page: number;
  pages: number;
}

interface CategoriesResponse {
  categories: CategoryOption[];
}

interface CategoryOption {
  name: string;
  total: number;
  promoTotal: number;
}

interface Props {
  productCount: number;
  promoCount: number;
}

export default function PriceTable({ productCount, promoCount }: Props) {
  const [tab, setTab] = useState<Tab>("prices");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [sortCol, setSortCol] = useState<SortCol>("item_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [promoSort, setPromoSort] = useState<PromoSort>("latest");
  const [page, setPage] = useState(1);

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [total, setTotal] = useState(productCount);
  const [pages, setPages] = useState(1);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [selectedPromo, setSelectedPromo] = useState<Promo | null>(null);
  const [promoTotal, setPromoTotal] = useState(promoCount);
  const [promoPages, setPromoPages] = useState(1);
  const [promoSortPending, setPromoSortPending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page on search/sort change
  useEffect(() => { setPage(1); }, [debouncedSearch, category, sortCol, sortDir, promoSort, tab]);

  useEffect(() => {
    async function fetchCategories() {
      const res = await fetch("/api/categories");
      const data: CategoriesResponse = await res.json();
      setCategories(data.categories);
    }
    fetchCategories()
      .catch(() => setCategories([]))
      .finally(() => setCategoriesLoading(false));
  }, []);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: debouncedSearch,
        category,
        page: String(page),
        sort: sortCol,
        dir: sortDir,
      });
      const res = await fetch(`/api/products?${params}`);
      const data: ProductsResponse = await res.json();
      setProducts(data.products);
      setTotal(data.total);
      if (data.promoTotal !== null) setPromoTotal(data.promoTotal);
      else setPromoTotal(promoCount);
      setPages(data.pages);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, category, page, sortCol, sortDir, promoCount]);

  // Fetch promos
  const fetchPromos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: debouncedSearch,
        category,
        page: String(page),
        sort: promoSort,
      });
      const res = await fetch(`/api/promos?${params}`);
      const data: PromosResponse = await res.json();
      setPromos(data.promos);
      setPromoTotal(data.total);
      if (data.productTotal !== null) setTotal(data.productTotal);
      else setTotal(productCount);
      setPromoPages(data.pages);
    } finally {
      setLoading(false);
      setPromoSortPending(false);
    }
  }, [debouncedSearch, category, page, promoSort, productCount]);

  useEffect(() => {
    if (tab === "prices") fetchProducts();
    else fetchPromos();
  }, [tab, fetchProducts, fetchPromos]);

  function handleSort(col: SortCol) {
    startTransition(() => {
      if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
      else { setSortCol(col); setSortDir("asc"); }
    });
  }

  function handlePromoSortToggle() {
    setPromoSortPending(true);
    setPromoSort(sort => sort === "biggest_discount" ? "latest" : "biggest_discount");
  }

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setCategory("");
    setPromoSort("latest");
  }

  const hasActiveFilters = search || debouncedSearch || category || promoSort !== "latest";

  const sortIcon = (col: SortCol) =>
    sortCol !== col ? " ⇅" : sortDir === "asc" ? " ↑" : " ↓";

  const itemCodes = (raw: string | string[]): string[] => {
    try { return typeof raw === "string" ? JSON.parse(raw || "[]") : (raw ?? []); }
    catch { return []; }
  };

  const formatCurrency = (value: number | string) => {
    const price = Number(value);
    return Number.isFinite(price) ? `₪${price.toFixed(2)}` : "";
  };

  const positiveNumber = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
      {/* Controls */}
      <div className="sticky top-0 z-10 bg-[#f7f8fa]/95 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            <TabBtn active={tab === "prices"} onClick={() => setTab("prices")}>
              מחירים ({total.toLocaleString()})
            </TabBtn>
            <TabBtn active={tab === "promos"} onClick={() => setTab("promos")}>
              מבצעים ({promoTotal.toLocaleString()})
            </TabBtn>
          </div>
          {tab === "promos" && (
            <button
              onClick={handlePromoSortToggle}
              disabled={promoSortPending}
              aria-busy={promoSortPending}
              className={`h-10 min-w-[132px] rounded-lg border px-4 text-sm font-bold transition-all whitespace-nowrap ${
                promoSort === "biggest_discount"
                  ? "border-[#171717] bg-[#171717] text-white shadow-sm"
                  : "border-gray-300 bg-white text-[#171717] hover:border-gray-400 hover:bg-gray-50"
              } ${promoSortPending ? "opacity-70 cursor-wait" : ""}`}
            >
              ההנחה הכי גדולה
            </button>
          )}
          <select
            value={category}
            onChange={event => setCategory(event.target.value)}
            disabled={categoriesLoading}
            className={`h-10 w-56 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-[#171717] focus:border-[#e31837] focus:outline-none focus:ring-2 focus:ring-[#e31837]/15 ${categoriesLoading ? "cursor-wait opacity-55" : ""}`}
          >
            <option value="">{categoriesLoading ? "טוען קטגוריות..." : "כל הקטגוריות"}</option>
            {categories.map(option => (
              <option key={option.name} value={option.name}>
                {option.name} ({(tab === "promos" ? option.promoTotal : option.total).toLocaleString()})
              </option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[160px]">
            <input
              type="text"
              placeholder="חיפוש..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-10 w-full rounded-lg border border-gray-300 bg-[#f7f8fa] px-4 text-sm transition-colors focus:border-[#e31837] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#e31837]/15"
              dir="rtl"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
              >×</button>
            )}
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm font-bold text-gray-600 transition-colors hover:border-[#e31837] hover:text-[#e31837]"
            >
              נקה סינון
            </button>
          )}
        </div>
      </div>

      <div className="relative py-4 sm:py-6">
        {loading && <LoadingSpinner />}
        {tab === "prices" && (
          <>
            <p className="text-xs text-gray-500 mb-2 px-1">
              מציג {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, total).toLocaleString()} מתוך {total.toLocaleString()} מוצרים
              {(debouncedSearch || category) && " (סינון פעיל)"}
            </p>
            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm sm:block">
              <div className="overflow-x-auto">
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col className="w-[34%]" />
                    <col className="w-[18%]" />
                    <col className="w-[12%]" />
                    <col className="w-[10%]" />
                    <col className="w-[10%]" />
                    <col className="w-[16%]" />
                  </colgroup>
                  <thead>
                    <tr className="bg-[#171717] text-white">
                      <Th onClick={() => handleSort("item_name")}>שם מוצר{sortIcon("item_name")}</Th>
                      <Th onClick={() => handleSort("item_code")}>ברקוד{sortIcon("item_code")}</Th>
                      <Th onClick={() => handleSort("item_price")}>מחיר{sortIcon("item_price")}</Th>
                      <Th>יחידה</Th>
                      <Th>מבצע</Th>
                      <Th onClick={() => handleSort("manufacturer_name")}>יצרן{sortIcon("manufacturer_name")}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.length === 0 && !loading ? (
                      <tr><td colSpan={6} className="text-center py-16 text-gray-400">לא נמצאו מוצרים</td></tr>
                    ) : products.map((p, i) => {
                      const hasDiscount = (p.discount_promos?.length ?? 0) > 0;
                      return (
                      <tr
                        key={p.item_code + i}
                        onClick={hasDiscount ? () => setSelectedProduct(p) : undefined}
                        className={`border-b border-gray-100 transition-colors hover:bg-red-50/70 ${hasDiscount ? "cursor-pointer" : ""} ${i % 2 === 1 ? "bg-[#fafafa]" : "bg-white"}`}
                      >
                        <td className="px-4 py-3">
                          <p className="truncate">{p.item_name}</p>
                          {p.category && <p className="mt-0.5 text-xs text-gray-400">{p.category}</p>}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400 text-xs font-mono truncate" dir="ltr">{p.item_code}</td>
                        <td className="px-4 py-3 font-bold text-green-700 whitespace-nowrap">₪{Number(p.item_price).toFixed(2)}</td>
                        <td className="px-4 py-3">
                          {p.unit_of_measure && (
                            <span className="inline-block rounded-lg border border-sky-100 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">{p.unit_of_measure}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {hasDiscount && (
                            <button
                              onClick={event => {
                                event.stopPropagation();
                                setSelectedProduct(p);
                              }}
                              className="rounded-lg bg-[#e31837] px-3 py-1 text-xs font-bold text-white transition-colors hover:bg-[#c91530] whitespace-nowrap"
                            >
                              מבצע
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs truncate">{p.manufacturer_name}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} pages={pages} onPage={setPage} />
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-2">
              {products.length === 0 && !loading ? (
                <div className="text-center py-16 text-gray-400">לא נמצאו מוצרים</div>
              ) : products.map((p, i) => {
                const hasDiscount = (p.discount_promos?.length ?? 0) > 0;
                return (
                <div
                  key={p.item_code + i}
                  onClick={hasDiscount ? () => setSelectedProduct(p) : undefined}
                  className={`flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-colors ${hasDiscount ? "cursor-pointer hover:bg-red-50/70" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm leading-snug truncate">{p.item_name}</p>
                    {p.category && <p className="mt-0.5 text-xs text-gray-400">{p.category}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {p.manufacturer_name && <span>{p.manufacturer_name} · </span>}
                      <span dir="ltr" className="font-mono">{p.item_code}</span>
                    </p>
                    {(p.unit_of_measure || hasDiscount) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {p.unit_of_measure && (
                          <span className="inline-block rounded-lg border border-sky-100 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">{p.unit_of_measure}</span>
                        )}
                        {hasDiscount && (
                          <button
                            onClick={event => {
                              event.stopPropagation();
                              setSelectedProduct(p);
                            }}
                            className="rounded-lg bg-[#e31837] px-3 py-1 text-xs font-bold text-white"
                          >
                            מבצע
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-xl font-bold text-green-700 whitespace-nowrap flex-shrink-0">
                    ₪{Number(p.item_price).toFixed(2)}
                  </div>
                </div>
                );
              })}
              <Pagination page={page} pages={pages} onPage={setPage} />
            </div>
          </>
        )}

        {tab === "promos" && (
          <>
            <p className="text-xs text-gray-500 mb-2 px-1">
              מציג {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, promoTotal).toLocaleString()} מתוך {promoTotal.toLocaleString()} מבצעים
              {(debouncedSearch || category) && " (סינון פעיל)"}
            </p>
            <div className="space-y-3">
              {promos.length === 0 && !loading ? (
                <div className="text-center py-16 text-gray-400">
                  <p className="text-xl font-semibold mb-2">אין מבצעים פעילים</p>
                </div>
              ) : promos.map(promo => {
                return (
                  <button
                    key={promo.promotion_id}
                    onClick={() => setSelectedPromo(promo)}
                    className="block w-full rounded-lg border border-gray-200 border-r-4 bg-white p-4 text-right shadow-sm transition-colors hover:bg-red-50/70"
                    style={{ borderRightColor: "#e31837" }}
                  >
                    <p className="font-bold leading-snug text-[#171717]">
                      {promo.description || `מבצע #${promo.promotion_id}`}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mt-2">
                      {promo.discounted_price && <span>מחיר: <strong className="text-green-700">{formatCurrency(promo.discounted_price)}</strong></span>}
                      {promo.min_qty && <span>מינ׳ כמות: {promo.min_qty}</span>}
                      {promo.max_qty && <span>מקס׳ כמות: {promo.max_qty}</span>}
                      {promo.min_purchase_amount && <span>מינ׳ קנייה: <strong className="text-gray-700">{formatCurrency(promo.min_purchase_amount)}</strong></span>}
                      {promo.end_date && <span className="text-xs text-gray-400">עד {String(promo.end_date).slice(0, 10)}</span>}
                    </div>
                  </button>
                );
              })}
              <Pagination page={page} pages={promoPages} onPage={setPage} />
            </div>
          </>
        )}
      </div>
      {selectedProduct && (
        <DiscountModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          formatCurrency={formatCurrency}
          positiveNumber={positiveNumber}
        />
      )}
      {selectedPromo && (
        <PromoModal
          promo={selectedPromo}
          onClose={() => setSelectedPromo(null)}
          itemCodes={itemCodes}
          formatCurrency={formatCurrency}
          positiveNumber={positiveNumber}
        />
      )}
    </div>
  );
}

function TabBtn({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`h-10 rounded-lg border px-4 text-sm font-bold transition-all whitespace-nowrap ${
        active ? "border-[#e31837] bg-[#e31837] text-white shadow-sm" : "border-red-200 bg-white text-[#e31837] hover:border-[#e31837] hover:bg-red-50"
      }`}
    >
      {children}
    </button>
  );
}

function DiscountModal({
  product,
  onClose,
  formatCurrency,
  positiveNumber,
}: {
  product: Product;
  onClose: () => void;
  formatCurrency: (value: number | string) => string;
  positiveNumber: (value: string) => number | null;
}) {
  const promos = product.discount_promos ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-lg border border-gray-200 bg-white p-5 shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-[#171717]">{product.item_name}</h2>
            <p className="mt-1 text-sm text-gray-500">
              מחיר רגיל: <strong className="text-green-700">{formatCurrency(product.item_price)}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg border border-gray-200 text-lg leading-none text-gray-500 hover:bg-gray-50"
            aria-label="סגירה"
          >
            ×
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {promos.map(promo => {
            const minQty = positiveNumber(promo.min_qty);
            const discountedPrice = positiveNumber(promo.discounted_price);
            const originalMinPrice = minQty ? Number(product.item_price) * minQty : null;
            const savings = originalMinPrice && discountedPrice ? originalMinPrice - discountedPrice : null;
            const sharedItems = (promo.original_items ?? []).filter(item => item.item_code !== product.item_code);

            return (
              <div key={promo.promotion_id} className="rounded-lg border border-gray-200 bg-[#fafafa] p-3">
                <p className="font-bold text-[#171717]">
                  {promo.description || `מבצע #${promo.promotion_id}`}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                  {promo.discount_rate && <span>הנחה לפריט: <strong className="text-[#e31837]">₪{promo.discount_rate}</strong></span>}
                  {savings && savings > 0 && <span>חיסכון כולל: <strong className="text-[#e31837]">{formatCurrency(savings)}</strong></span>}
                  {promo.discounted_price && <span>מחיר מבצע: <strong className="text-green-700">{formatCurrency(promo.discounted_price)}</strong></span>}
                  {promo.min_qty && <span>מינ׳ כמות: {promo.min_qty}</span>}
                  {promo.min_purchase_amount && <span>מינ׳ קנייה: <strong className="text-gray-700">{formatCurrency(promo.min_purchase_amount)}</strong></span>}
                  <span>מקורי ליחידה: <strong className="text-[#171717]">{formatCurrency(product.item_price)}</strong></span>
                  {originalMinPrice && <span>מקורי למינ׳: <strong className="text-[#171717]">{formatCurrency(originalMinPrice)}</strong></span>}
                  {promo.end_date && <span className="text-xs text-gray-400">עד {String(promo.end_date).slice(0, 10)}</span>}
                </div>
                {sharedItems.length > 0 && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <p className="text-xs font-semibold text-gray-500">מוצרים נוספים במבצע</p>
                    <div className="mt-2 space-y-2">
                      {sharedItems.map(item => (
                        <div key={item.item_code} className="rounded-lg border border-gray-200 bg-white p-2 text-sm text-gray-600">
                          <p className="font-semibold leading-snug text-[#171717]">{item.item_name || item.item_code}</p>
                          <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                            <span>מחיר רגיל: <strong className="text-[#171717]">{formatCurrency(item.item_price)}</strong></span>
                            <span className="text-xs text-gray-400">
                            ברקוד: <span dir="ltr" className="font-mono">{item.item_code}</span>
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PromoModal({
  promo,
  onClose,
  itemCodes,
  formatCurrency,
  positiveNumber,
}: {
  promo: Promo;
  onClose: () => void;
  itemCodes: (raw: string | string[]) => string[];
  formatCurrency: (value: number | string) => string;
  positiveNumber: (value: string) => number | null;
}) {
  const codes = itemCodes(promo.item_codes);
  const minQty = positiveNumber(promo.min_qty);
  const discountedPrice = positiveNumber(promo.discounted_price);
  const originalItems = promo.original_items ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-lg border border-gray-200 bg-white p-5 shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-[#171717]">
              {promo.description || `מבצע #${promo.promotion_id}`}
            </h2>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
              {promo.discount_rate && <span>הנחה לפריט: <strong className="text-[#e31837]">₪{promo.discount_rate}</strong></span>}
              {promo.discounted_price && <span>מחיר מבצע: <strong className="text-green-700">{formatCurrency(promo.discounted_price)}</strong></span>}
              {promo.min_qty && <span>מינ׳ כמות: {promo.min_qty}</span>}
              {promo.min_purchase_amount && <span>מינ׳ קנייה: <strong className="text-gray-700">{formatCurrency(promo.min_purchase_amount)}</strong></span>}
              {promo.end_date && <span className="text-xs text-gray-400">עד {String(promo.end_date).slice(0, 10)}</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg border border-gray-200 text-lg leading-none text-gray-500 hover:bg-gray-50"
            aria-label="סגירה"
          >
            ×
          </button>
        </div>

        {originalItems.length > 0 && (
          <div className="mt-4 space-y-2">
            {originalItems.map(item => {
              const originalMinPrice = minQty ? Number(item.item_price) * minQty : null;
              const savings = originalMinPrice && discountedPrice ? originalMinPrice - discountedPrice : null;

              return (
                <div key={item.item_code} className="rounded-lg border border-gray-200 bg-[#fafafa] p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="font-bold text-[#171717]">{item.item_name || item.item_code}</p>
                    <span className="text-xs text-gray-400">
                      ברקוד: <span dir="ltr" className="font-mono">{item.item_code}</span>
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                    {promo.discount_rate && <span>הנחה לפריט: <strong className="text-[#e31837]">₪{promo.discount_rate}</strong></span>}
                    {savings && savings > 0 && <span>חיסכון כולל: <strong className="text-[#e31837]">{formatCurrency(savings)}</strong></span>}
                    <span>מקורי ליחידה: <strong className="text-[#171717]">{formatCurrency(item.item_price)}</strong></span>
                    {originalMinPrice && (
                      <span>מקורי למינ׳: <strong className="text-[#171717]">{formatCurrency(originalMinPrice)}</strong></span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {originalItems.length === 0 && codes.length > 0 && (
          <p className="mt-4 text-xs text-gray-400">
            {codes.slice(0, 10).join(", ")}{codes.length > 10 ? ` +${codes.length - 10}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-1/2 z-20 flex -translate-y-1/2 justify-center">
      <div
        className="h-10 w-10 rounded-full border-4 border-white bg-white/80 border-t-[#e31837] shadow-md animate-spin"
        aria-label="טוען"
        role="status"
      />
    </div>
  );
}

function Th({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <th onClick={onClick} className={`px-4 py-3 text-right text-xs font-bold uppercase whitespace-nowrap select-none ${onClick ? "cursor-pointer hover:bg-white/10" : ""}`}>
      {children}
    </th>
  );
}

function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;

  const range: (number | "...")[] = [];
  const lo = Math.max(2, page - 2);
  const hi = Math.min(pages - 1, page + 2);
  range.push(1);
  if (lo > 2) range.push("...");
  for (let i = lo; i <= hi; i++) range.push(i);
  if (hi < pages - 1) range.push("...");
  if (pages > 1) range.push(pages);

  return (
    <div className="flex flex-wrap items-center justify-center gap-1 p-4">
      <PgBtn disabled={page === 1} onClick={() => onPage(page - 1)}>‹</PgBtn>
      {range.map((item, i) =>
        item === "..." ? <span key={`e${i}`} className="px-1 text-gray-400">…</span> : (
          <PgBtn key={item} active={item === page} onClick={() => onPage(item as number)}>{item}</PgBtn>
        )
      )}
      <PgBtn disabled={page === pages} onClick={() => onPage(page + 1)}>›</PgBtn>
    </div>
  );
}

function PgBtn({ children, onClick, active, disabled }: { children: React.ReactNode; onClick?: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-9 h-9 rounded-lg text-sm border transition-all ${
        active ? "bg-[#e31837] text-white border-[#e31837]"
        : disabled ? "opacity-40 cursor-default border-gray-200"
        : "border-gray-300 hover:bg-[#e31837] hover:text-white hover:border-[#e31837]"
      }`}
    >
      {children}
    </button>
  );
}
