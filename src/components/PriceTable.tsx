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
  page: number;
  pages: number;
}

interface PromosResponse {
  promos: Promo[];
  total: number;
  page: number;
  pages: number;
}

interface Props {
  productCount: number;
  promoCount: number;
}

export default function PriceTable({ productCount, promoCount }: Props) {
  const [tab, setTab] = useState<Tab>("prices");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
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
  useEffect(() => { setPage(1); }, [debouncedSearch, sortCol, sortDir, promoSort, tab]);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: debouncedSearch,
        page: String(page),
        sort: sortCol,
        dir: sortDir,
      });
      const res = await fetch(`/api/products?${params}`);
      const data: ProductsResponse = await res.json();
      setProducts(data.products);
      setTotal(data.total);
      setPages(data.pages);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, sortCol, sortDir]);

  // Fetch promos
  const fetchPromos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: debouncedSearch,
        page: String(page),
        sort: promoSort,
      });
      const res = await fetch(`/api/promos?${params}`);
      const data: PromosResponse = await res.json();
      setPromos(data.promos);
      setPromoTotal(data.total);
      setPromoPages(data.pages);
    } finally {
      setLoading(false);
      setPromoSortPending(false);
    }
  }, [debouncedSearch, page, promoSort]);

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
    <div>
      {/* Controls */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-8 py-3 flex gap-3 items-center flex-wrap sticky top-0 z-10 shadow-sm">
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
            className={`min-w-[132px] h-10 px-4 rounded-lg font-semibold text-sm border-2 transition-all whitespace-nowrap ${
              promoSort === "biggest_discount"
                ? "border-[#1a1a2e] bg-[#1a1a2e] text-white"
                : "border-gray-300 text-[#1a1a2e] bg-white hover:bg-gray-50"
            } ${promoSortPending ? "opacity-70 cursor-wait" : ""}`}
          >
            ההנחה הכי גדולה
          </button>
        )}
        <div className="relative flex-1 min-w-[160px]">
          <input
            type="text"
            placeholder="חיפוש..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:border-[#e31837] focus:ring-2 focus:ring-[#e31837]/20"
            dir="rtl"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
            >×</button>
          )}
        </div>
      </div>

      <div className="relative p-3 sm:p-6">
        {loading && <LoadingSpinner />}
        {tab === "prices" && (
          <>
            <p className="text-xs text-gray-500 mb-2 px-1">
              מציג {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, total).toLocaleString()} מתוך {total.toLocaleString()} מוצרים
              {debouncedSearch && " (סינון פעיל)"}
            </p>
            {/* Desktop table */}
            <div className="hidden sm:block bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "#1a1a2e", color: "white" }}>
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
                        className={`border-b border-gray-100 hover:bg-red-50 transition-colors ${hasDiscount ? "cursor-pointer" : ""} ${i % 2 === 1 ? "bg-gray-50" : ""}`}
                      >
                        <td className="px-4 py-3">{p.item_name}</td>
                        <td className="px-4 py-3 text-right text-gray-400 text-xs font-mono" dir="ltr">{p.item_code}</td>
                        <td className="px-4 py-3 font-bold text-green-700 whitespace-nowrap">₪{Number(p.item_price).toFixed(2)}</td>
                        <td className="px-4 py-3">
                          {p.unit_of_measure && (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200">{p.unit_of_measure}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {hasDiscount && (
                            <button
                              onClick={event => {
                                event.stopPropagation();
                                setSelectedProduct(p);
                              }}
                              className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#e31837] text-white hover:bg-[#c91530] transition-colors whitespace-nowrap"
                            >
                              מבצע
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{p.manufacturer_name}</td>
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
                  className={`bg-white rounded-xl p-4 shadow-sm flex items-center justify-between gap-3 ${hasDiscount ? "cursor-pointer" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm leading-snug truncate">{p.item_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {p.manufacturer_name && <span>{p.manufacturer_name} · </span>}
                      <span dir="ltr" className="font-mono">{p.item_code}</span>
                    </p>
                    {p.unit_of_measure && (
                      <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200">{p.unit_of_measure}</span>
                    )}
                    {hasDiscount && (
                      <button
                        onClick={event => {
                          event.stopPropagation();
                          setSelectedProduct(p);
                        }}
                        className="mt-2 block px-3 py-1 rounded-lg text-xs font-semibold bg-[#e31837] text-white"
                      >
                        מבצע
                      </button>
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
              {debouncedSearch && " (סינון פעיל)"}
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
                    className="block w-full bg-white rounded-xl p-4 shadow-sm border-r-4 text-right hover:bg-red-50 transition-colors"
                    style={{ borderRightColor: "#e31837" }}
                  >
                    <p className="font-semibold text-[#1a1a2e] leading-snug">
                      {promo.description || `מבצע #${promo.promotion_id}`}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mt-2">
                      {promo.discounted_price && <span>מחיר: <strong className="text-green-700">{formatCurrency(promo.discounted_price)}</strong></span>}
                      {promo.min_qty && <span>מינ׳: {promo.min_qty}</span>}
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
      className={`px-4 py-2 rounded-lg font-semibold text-sm border-2 transition-all whitespace-nowrap ${
        active ? "border-[#e31837] bg-[#e31837] text-white" : "border-[#e31837] text-[#e31837] bg-white hover:bg-[#e31837] hover:text-white"
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
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-[#1a1a2e]">{product.item_name}</h2>
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
              <div key={promo.promotion_id} className="rounded-lg border border-gray-200 p-3">
                <p className="font-semibold text-[#1a1a2e]">
                  {promo.description || `מבצע #${promo.promotion_id}`}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                  {promo.discount_rate && <span>הנחה: <strong className="text-[#e31837]">₪{promo.discount_rate}</strong></span>}
                  {promo.discounted_price && <span>מחיר מבצע: <strong className="text-green-700">{formatCurrency(promo.discounted_price)}</strong></span>}
                  {promo.min_qty && <span>מינ׳: {promo.min_qty}</span>}
                  <span>מקורי ליחידה: <strong className="text-[#1a1a2e]">{formatCurrency(product.item_price)}</strong></span>
                  {originalMinPrice && <span>מקורי למינ׳: <strong className="text-[#1a1a2e]">{formatCurrency(originalMinPrice)}</strong></span>}
                  {savings && savings > 0 && <span>חיסכון: <strong className="text-[#e31837]">{formatCurrency(savings)}</strong></span>}
                  {promo.end_date && <span className="text-xs text-gray-400">עד {String(promo.end_date).slice(0, 10)}</span>}
                </div>
                {sharedItems.length > 0 && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <p className="text-xs font-semibold text-gray-500">מוצרים נוספים במבצע</p>
                    <div className="mt-2 space-y-2">
                      {sharedItems.map(item => (
                        <div key={item.item_code} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-gray-600">
                          <span className="min-w-0 flex-1 truncate">{item.item_name || item.item_code}</span>
                          <span>מחיר רגיל: <strong className="text-[#1a1a2e]">{formatCurrency(item.item_price)}</strong></span>
                          <span className="text-xs text-gray-400">
                            ברקוד: <span dir="ltr" className="font-mono">{item.item_code}</span>
                          </span>
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
  const originalItems = promo.original_items ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-[#1a1a2e]">
              {promo.description || `מבצע #${promo.promotion_id}`}
            </h2>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
              {promo.discount_rate && <span>הנחה: <strong className="text-[#e31837]">₪{promo.discount_rate}</strong></span>}
              {promo.discounted_price && <span>מחיר מבצע: <strong className="text-green-700">{formatCurrency(promo.discounted_price)}</strong></span>}
              {promo.min_qty && <span>מינ׳: {promo.min_qty}</span>}
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
            {originalItems.map(item => (
              <div key={item.item_code} className="rounded-lg border border-gray-200 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="font-semibold text-[#1a1a2e]">{item.item_name || item.item_code}</p>
                  <span className="text-xs text-gray-400">
                    ברקוד: <span dir="ltr" className="font-mono">{item.item_code}</span>
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                  <span>מקורי ליחידה: <strong className="text-[#1a1a2e]">{formatCurrency(item.item_price)}</strong></span>
                  {minQty && (
                    <span>מקורי למינ׳: <strong className="text-[#1a1a2e]">{formatCurrency(Number(item.item_price) * minQty)}</strong></span>
                  )}
                </div>
              </div>
            ))}
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
    <div className="pointer-events-none absolute inset-x-0 top-28 z-10 flex justify-center">
      <div
        className="h-10 w-10 rounded-full border-4 border-gray-200 border-t-[#e31837] animate-spin"
        aria-label="טוען"
        role="status"
      />
    </div>
  );
}

function Th({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <th onClick={onClick} className={`px-4 py-3 text-right font-semibold whitespace-nowrap select-none ${onClick ? "cursor-pointer hover:bg-[#2d2d4e]" : ""}`}>
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
    <div className="flex items-center justify-center gap-1 p-4 flex-wrap">
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
