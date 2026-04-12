"use client";

import { useState, useEffect, useCallback, useTransition, useRef } from "react";
import NextImage from "next/image";
import type { Product, Promo, PromoOriginalItem } from "@/lib/db";
import { signIn, useSession } from "next-auth/react";
import { BarcodeFormat, BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";

const PRODUCT_IMAGES_BASE = "/victory-gt";

type Tab = "prices" | "promos" | "favourites" | "shopping";
type SortCol = "item_name" | "item_price" | "manufacturer_name" | "item_code";
type SortDir = "asc" | "desc";
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

interface FavouritesResponse {
  favourites: string[];
}

interface ShoppingListItem {
  item_code: string;
  item_name: string;
  item_price: number;
  quantity: number;
  checked: boolean;
  category?: string | null;
  promo_label?: string | null;
}

interface ShoppingListResponse {
  items: ShoppingListItem[];
}

interface HouseholdInfo {
  householdId: string;
  householdName: string;
  inviteCode: string;
  role: string;
  memberCount: number;
}

interface HouseholdResponse {
  household: HouseholdInfo;
  error?: string;
}

interface CategoryOption {
  name: string;
  total: number;
}

interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue?: string }>>;
}

interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
}

interface BarcodeTrackCapabilities extends MediaTrackCapabilities {
  focusMode?: string[];
  zoom?: { min?: number; max?: number };
}

type BarcodeTrackConstraints = MediaTrackConstraints & {
  advanced?: Array<{
    focusMode?: "continuous" | "single-shot" | "manual";
    zoom?: number;
  }>;
};

type WindowWithBarcodeDetector = Window & {
  BarcodeDetector?: BarcodeDetectorCtor;
};

import Header from "@/components/Header";
import type { Branch } from "@/lib/db";

interface Props {
  productCount: number;
  promoCount: number;
  branch: Branch | null;
  lastUpdated: string | null;
}

export default function PriceTable({ productCount, promoCount, branch, lastUpdated }: Props) {
  const { status } = useSession();
  const [tab, setTab] = useState<Tab>("prices");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [sortCol, setSortCol] = useState<SortCol>("item_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [imageModalProduct, setImageModalProduct] = useState<Product | null>(null);
  const [total, setTotal] = useState(productCount);
  const [productTotalCount, setProductTotalCount] = useState(productCount);
  const [pages, setPages] = useState(1);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [selectedPromo, setSelectedPromo] = useState<Promo | null>(null);
  const [promoTotal, setPromoTotal] = useState(promoCount);
  const [promoPages, setPromoPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [favouriteCodes, setFavouriteCodes] = useState<Set<string>>(new Set());
  const [favouritePendingCode, setFavouritePendingCode] = useState<string | null>(null);
  const [shoppingList, setShoppingList] = useState<ShoppingListItem[]>([]);
  const [shoppingPendingCode, setShoppingPendingCode] = useState<string | null>(null);
  const [household, setHousehold] = useState<HouseholdInfo | null>(null);
  const [householdPending, setHouseholdPending] = useState(false);
  const [cartWarning, setCartWarning] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scannerStatus, setScannerStatus] = useState("כוון את המצלמה אל הברקוד");
  const [scannerCode, setScannerCode] = useState<string | null>(null);
  const [scannerProduct, setScannerProduct] = useState<Product | null>(null);
  const [scannerLoadingProduct, setScannerLoadingProduct] = useState(false);
  const [scannerCameraActive, setScannerCameraActive] = useState(false);
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerFrameRef = useRef<number | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const scannerReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const [, startTransition] = useTransition();

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset filters and page on tab change
  const prevTab = useRef(tab);
  useEffect(() => {
    if (prevTab.current !== tab) {
      prevTab.current = tab;
      setSearch("");
      setDebouncedSearch("");
      setCategory("");
      setSortCol("item_name");
      setSortDir("asc");
      setPage(1);
    }
  }, [tab]);

  // Reset page on search/sort change
  useEffect(() => { setPage(1); }, [debouncedSearch, category, sortCol, sortDir]);

  useEffect(() => {
    async function fetchCategories() {
      const res = await fetch("/victory-gt/api/categories");
      const data: CategoriesResponse = await res.json();
      setCategories(data.categories);
    }
    fetchCategories()
      .catch(() => setCategories([]))
      .finally(() => setCategoriesLoading(false));
  }, []);

  const fetchFavourites = useCallback(async () => {
    if (status !== "authenticated") {
      setFavouriteCodes(new Set());
      return;
    }

    try {
      const res = await fetch("/victory-gt/api/favourites", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load favourites");
      const data: FavouritesResponse = await res.json();
      setFavouriteCodes(new Set(data.favourites));
    } catch {
      setFavouriteCodes(new Set());
    }
  }, [status]);

  useEffect(() => {
    fetchFavourites();
  }, [fetchFavourites]);

  const fetchShoppingList = useCallback(async () => {
    if (status !== "authenticated") {
      setShoppingList([]);
      return;
    }
    try {
      const res = await fetch("/victory-gt/api/shopping-list", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load shopping list");
      const data: ShoppingListResponse = await res.json();
      setShoppingList(data.items);
    } catch {
      setShoppingList([]);
    }
  }, [status]);

  useEffect(() => {
    fetchShoppingList();
  }, [fetchShoppingList]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchShoppingList();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [fetchShoppingList]);

  const fetchHousehold = useCallback(async () => {
    if (status !== "authenticated") {
      setHousehold(null);
      return;
    }

    try {
      const res = await fetch("/victory-gt/api/household", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load household");
      const data: HouseholdResponse = await res.json();
      setHousehold(data.household);
    } catch {
      setHousehold(null);
    }
  }, [status]);

  useEffect(() => {
    fetchHousehold();
  }, [fetchHousehold]);

  useEffect(() => {
    if (!cartWarning) return;

    const timeoutId = window.setTimeout(() => setCartWarning(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [cartWarning]);

  const stopScanner = useCallback(() => {
    if (scannerFrameRef.current !== null) {
      window.cancelAnimationFrame(scannerFrameRef.current);
      scannerFrameRef.current = null;
    }
    if (scannerControlsRef.current) {
      scannerControlsRef.current.stop();
      scannerControlsRef.current = null;
    }
    if (scannerStreamRef.current) {
      for (const track of scannerStreamRef.current.getTracks()) track.stop();
      scannerStreamRef.current = null;
    }
    if (scannerVideoRef.current) {
      scannerVideoRef.current.srcObject = null;
    }
    setScannerCameraActive(false);
  }, []);

  const fetchProductByBarcode = useCallback(async (barcode: string) => {
    setScannerLoadingProduct(true);
    setScannerProduct(null);
    setScannerStatus("מחפש מוצר...");
    try {
      const params = new URLSearchParams({ q: barcode, page: "1", sort: "item_code", dir: "asc" });
      const res = await fetch(`/victory-gt/api/products?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load product");
      const data: ProductsResponse = await res.json();
      const exactMatch = data.products.find(product => product.item_code === barcode) ?? null;
      setScannerProduct(exactMatch);
      setScannerStatus(exactMatch ? "המוצר נסרק בהצלחה" : "לא נמצא מוצר עבור הברקוד הזה");
    } catch {
      setScannerProduct(null);
      setScannerStatus("לא הצלחנו לטעון את פרטי המוצר");
    } finally {
      setScannerLoadingProduct(false);
    }
  }, []);

  const startScanner = useCallback(async () => {
    if (typeof window === "undefined") return;

    stopScanner();
    setScannerError(null);
    setScannerCode(null);
    setScannerProduct(null);
    setScannerCameraActive(false);
    setScannerStatus("מבקש הרשאת מצלמה...");

    const BarcodeDetectorApi = (window as WindowWithBarcodeDetector).BarcodeDetector;
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerError("סריקת ברקוד דורשת גישה למצלמה, אך הדפדפן לא תומך ב-getUserMedia.");
      return;
    }

    try {
      const openCameraStream = async (preferEnvironment: boolean) => {
        return navigator.mediaDevices.getUserMedia({
          video: preferEnvironment
            ? {
                facingMode: { ideal: "environment" },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30, max: 60 },
              }
            : {
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30, max: 60 },
              },
          audio: false,
        });
      };

      const configureScannerTrack = async (stream: MediaStream) => {
        const [track] = stream.getVideoTracks();
        if (!track || typeof track.applyConstraints !== "function") return;

        const capabilities = typeof track.getCapabilities === "function"
          ? (track.getCapabilities() as BarcodeTrackCapabilities)
          : null;

        const advanced: NonNullable<BarcodeTrackConstraints["advanced"]> = [];

        if (capabilities?.focusMode?.includes("continuous")) {
          advanced.push({ focusMode: "continuous" });
        } else if (capabilities?.focusMode?.includes("single-shot")) {
          advanced.push({ focusMode: "single-shot" });
        }

        const zoomRange = capabilities?.zoom;
        if (zoomRange?.max && zoomRange.max > 1) {
          const minZoom = zoomRange.min ?? 1;
          const preferredZoom = Math.min(2, zoomRange.max);
          advanced.push({ zoom: Math.max(minZoom, preferredZoom) });
        }

        if (advanced.length === 0) return;

        try {
          await track.applyConstraints({ advanced } satisfies BarcodeTrackConstraints);
        } catch {
          // Some mobile browsers expose capabilities but reject applying them.
        }
      };

      const waitForVideoElement = async () => {
        const startedAt = Date.now();
        while (Date.now() - startedAt < 2000) {
          if (scannerVideoRef.current) return scannerVideoRef.current;
          await new Promise(resolve => window.setTimeout(resolve, 50));
        }
        throw new Error("Scanner video element is missing");
      };

      const attachPreview = async (stream: MediaStream) => {
        scannerStreamRef.current = stream;
        setScannerCameraActive(true);
        const video = await waitForVideoElement();
        video.srcObject = stream;
        await video.play();
        await configureScannerTrack(stream);

        const startedAt = Date.now();
        while (Date.now() - startedAt < 4000) {
          if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
            return true;
          }
          await new Promise(resolve => window.setTimeout(resolve, 200));
        }

        return false;
      };

      if (BarcodeDetectorApi) {
        let stream = await openCameraStream(true);
        let previewReady = await attachPreview(stream);
        if (!previewReady) {
          for (const track of stream.getTracks()) track.stop();
          setScannerStatus("עובר למצלמת ברירת המחדל...");
          stream = await openCameraStream(false);
          previewReady = await attachPreview(stream);
        }
        if (!previewReady) {
          throw new Error("Camera preview did not start");
        }

        const detector = new BarcodeDetectorApi({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"],
        });

        setScannerStatus("כוון את המצלמה אל הברקוד");

        const scanFrame = async () => {
          const video = scannerVideoRef.current;
          if (!video || video.readyState < 2) {
            scannerFrameRef.current = window.requestAnimationFrame(() => { void scanFrame(); });
            return;
          }

          try {
            const results = await detector.detect(video);
            const rawValue = results.find(result => result.rawValue?.trim())?.rawValue?.trim();
            if (rawValue) {
              setScannerCode(rawValue);
              setScannerStatus(`נסרק: ${rawValue}`);
              stopScanner();
              await fetchProductByBarcode(rawValue);
              return;
            }
          } catch {
            setScannerError("סריקת הברקוד נכשלה. אפשר לנסות שוב.");
            stopScanner();
            return;
          }

          scannerFrameRef.current = window.requestAnimationFrame(() => { void scanFrame(); });
        };

        scannerFrameRef.current = window.requestAnimationFrame(() => { void scanFrame(); });
        return;
      }

      const video = await waitForVideoElement();

      if (!scannerReaderRef.current) {
        const reader = new BrowserMultiFormatReader();
        reader.possibleFormats = [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
        ];
        scannerReaderRef.current = reader;
      }

      setScannerStatus("כוון את המצלמה אל הברקוד");
      let stream = await openCameraStream(true);
      let previewReady = await attachPreview(stream);
      if (!previewReady) {
        for (const track of stream.getTracks()) track.stop();
        setScannerStatus("עובר למצלמת ברירת המחדל...");
        stream = await openCameraStream(false);
        previewReady = await attachPreview(stream);
      }
      if (!previewReady) {
        throw new Error("Camera preview did not start");
      }
      let handled = false;
      scannerControlsRef.current = await scannerReaderRef.current.decodeFromStream(stream, video, (result, _error, controls) => {
        if (handled) return;
        const rawValue = result?.getText()?.trim();
        if (!rawValue) return;
        handled = true;
        scannerControlsRef.current = controls;
        setScannerCode(rawValue);
        setScannerStatus(`נסרק: ${rawValue}`);
        stopScanner();
        void fetchProductByBarcode(rawValue);
      });
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      console.error("Barcode scanner startup failed", error);
      setScannerError(`לא הצלחנו לפתוח את המצלמה. ${details}`);
      stopScanner();
    }
  }, [fetchProductByBarcode, stopScanner]);

  useEffect(() => {
    if (!scannerOpen) {
      stopScanner();
      return;
    }
    void startScanner();
    return () => stopScanner();
  }, [scannerOpen, startScanner, stopScanner]);

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
      if (tab === "favourites") {
        for (const code of favouriteCodes) {
          params.append("itemCode", code);
        }
      }
      const res = await fetch(`/victory-gt/api/products?${params}`);
      const data: ProductsResponse = await res.json();
      setProducts(data.products);
      setTotal(data.total);
      if (tab === "prices") setProductTotalCount(data.total);
      if (data.promoTotal !== null) setPromoTotal(data.promoTotal);
      else setPromoTotal(promoCount);
      setPages(data.pages);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, category, page, sortCol, sortDir, promoCount, tab, favouriteCodes]);

  // Fetch promos
  const fetchPromos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: debouncedSearch, category, page: String(page) });
      const res = await fetch(`/victory-gt/api/promos?${params}`);
      const data: PromosResponse = await res.json();
      setPromos(data.promos);
      setPromoTotal(data.total);
      if (data.productTotal !== null) {
        setTotal(data.productTotal);
        setProductTotalCount(data.productTotal);
      } else {
        setTotal(productCount);
        setProductTotalCount(productCount);
      }
      setPromoPages(data.pages);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, category, page, productCount]);

  useEffect(() => {
    if (tab === "prices" || tab === "favourites") fetchProducts();
    else fetchPromos();
  }, [tab, fetchProducts, fetchPromos]);

  function handleSort(col: SortCol) {
    startTransition(() => {
      if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
      else { setSortCol(col); setSortDir("asc"); }
    });
  }

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setCategory("");
  }


  const hasActiveFilters = search || debouncedSearch || category;

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

  const promptGoogleSignIn = useCallback(() => {
    void signIn("google", {
      callbackUrl: typeof window === "undefined" ? "/victory-gt/prices" : window.location.href,
    });
  }, []);

  const toggleFavourite = useCallback(async (itemCode: string) => {
    if (status !== "authenticated") {
      promptGoogleSignIn();
      return;
    }

    const isFavourite = favouriteCodes.has(itemCode);
    setFavouritePendingCode(itemCode);
    try {
      const res = await fetch("/victory-gt/api/favourites", {
        method: isFavourite ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemCode }),
      });

      if (res.status === 401) {
        promptGoogleSignIn();
        return;
      }
      if (!res.ok) throw new Error("Failed to update favourite");

      setFavouriteCodes(current => {
        const next = new Set(current);
        if (isFavourite) next.delete(itemCode);
        else next.add(itemCode);
        return next;
      });
    } finally {
      setFavouritePendingCode(null);
    }
  }, [favouriteCodes, promptGoogleSignIn, status]);

  const addToCart = useCallback(async (product: { item_code: string; item_name: string; item_price: number; category?: string | null; is_available?: boolean }) => {
    if (product.is_available === false) {
      const message = "This product is currently out of stock.";
      setCartWarning(message);
      if (typeof window !== "undefined") window.alert(message);
      return;
    }
    if (status !== "authenticated") { promptGoogleSignIn(); return; }
    setCartWarning(null);
    setShoppingPendingCode(product.item_code);
    try {
      const res = await fetch("/victory-gt/api/shopping-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemCode: product.item_code, itemName: product.item_name, itemPrice: product.item_price, itemCategory: product.category ?? null }),
      });
      if (res.status === 401) { promptGoogleSignIn(); return; }
      if (!res.ok) throw new Error("Failed to update shopping list");
      setShoppingList(current => {
        const existing = current.find(i => i.item_code === product.item_code);
        if (existing) {
          return current.map(i => i.item_code === product.item_code
            ? { ...i, item_name: product.item_name, item_price: product.item_price, category: product.category ?? i.category ?? null, quantity: i.quantity + 1, checked: false }
            : i);
        }
        return [...current, {
          item_code: product.item_code,
          item_name: product.item_name,
          item_price: product.item_price,
          category: product.category ?? null,
          quantity: 1,
          checked: false,
        }];
      });
      void fetchShoppingList();
    } finally {
      setShoppingPendingCode(null);
    }
  }, [promptGoogleSignIn, status, fetchShoppingList]);

  const decrementCart = useCallback(async (product: { item_code: string }) => {
    setShoppingPendingCode(product.item_code);
    try {
      await fetch("/victory-gt/api/shopping-list", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemCode: product.item_code }),
      });
      setShoppingList(current => {
        const existing = current.find(i => i.item_code === product.item_code);
        if (!existing) return current;
        if (existing.quantity <= 1) return current.filter(i => i.item_code !== product.item_code);
        return current.map(i => i.item_code === product.item_code ? { ...i, quantity: i.quantity - 1 } : i);
      });
    } finally {
      setShoppingPendingCode(null);
    }
  }, []);

  const toggleChecked = useCallback(async (item: ShoppingListItem) => {
    const next = !item.checked;
    setShoppingList(current => current.map(i =>
      i.item_code === item.item_code ? { ...i, checked: next } : i
    ));
    await fetch("/victory-gt/api/shopping-list", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemCode: item.item_code, checked: next }),
    });
  }, []);

  const resetCart = useCallback(async () => {
    const all = shoppingList;
    setShoppingList([]);
    await Promise.all(all.map(item =>
      fetch("/victory-gt/api/shopping-list", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemCode: item.item_code, force: true }),
      })
    ));
  }, [shoppingList]);

  const joinHousehold = useCallback(async (inviteCode: string) => {
    if (status !== "authenticated") {
      promptGoogleSignIn();
      return;
    }

    setHouseholdPending(true);
    try {
      const res = await fetch("/victory-gt/api/household", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode }),
      });

      const data: HouseholdResponse = await res.json();
      if (res.status === 401) {
        promptGoogleSignIn();
        return;
      }
      if (!res.ok) throw new Error(data.error || "Failed to join household");

      setHousehold(data.household);
      await fetchShoppingList();
      if (typeof window !== "undefined") window.alert("העגלה המשותפת חוברה בהצלחה");
    } catch (error) {
      if (typeof window !== "undefined") {
        window.alert(error instanceof Error ? error.message : "Failed to join household");
      }
    } finally {
      setHouseholdPending(false);
    }
  }, [fetchShoppingList, promptGoogleSignIn, status]);

  const openScanner = useCallback(() => {
    setScannerOpen(true);
  }, []);

  const closeScanner = useCallback(() => {
    setScannerOpen(false);
    setScannerError(null);
    setScannerCode(null);
    setScannerProduct(null);
    setScannerCameraActive(false);
    setScannerStatus("כוון את המצלמה אל הברקוד");
  }, []);

  return (
    <>
    <Header branch={branch} lastUpdated={lastUpdated} onCartClick={() => { setTab("shopping"); void fetchShoppingList(); }} cartCount={shoppingList.length} />
    <div className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
      {/* Controls */}
      <div className="sticky top-0 z-10 bg-[#f7f8fa]/95 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid w-full grid-cols-3 gap-1 sm:flex sm:w-auto">
            <TabBtn active={tab === "prices"} onClick={() => setTab("prices")}>
              מחירים ({productTotalCount.toLocaleString()})
            </TabBtn>
            <TabBtn active={tab === "promos"} onClick={() => setTab("promos")}>
              מבצעים ({promoTotal.toLocaleString()})
            </TabBtn>
            <TabBtn active={tab === "favourites"} onClick={() => setTab("favourites")}>
              מועדפים ({favouriteCodes.size.toLocaleString()})
            </TabBtn>
          </div>
          {tab !== "shopping" && (
            <>
              <select
                value={category}
                onChange={event => setCategory(event.target.value)}
                disabled={categoriesLoading}
                className={`h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-[#171717] focus:border-[#e31837] focus:outline-none focus:ring-2 focus:ring-[#e31837]/15 sm:w-56 ${categoriesLoading ? "cursor-wait opacity-55" : ""}`}
              >
                <option value="">{categoriesLoading ? "טוען קטגוריות..." : "כל הקטגוריות"}</option>
                {categories.map(option => (
                  <option key={option.name} value={option.name}>
                    {option.name} ({option.total.toLocaleString()})
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
              <button
                type="button"
                onClick={openScanner}
                className="sm:hidden h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm font-bold text-[#171717] transition-colors hover:border-[#e31837] hover:text-[#e31837]"
              >
                סריקת ברקוד
              </button>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm font-bold text-gray-600 transition-colors hover:border-[#e31837] hover:text-[#e31837]"
                >
                  נקה סינון
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="relative py-4 sm:py-6">
        {loading && <LoadingSpinner />}
        {(tab === "prices" || tab === "favourites") && (
          <>
            {tab === "favourites" && status !== "authenticated" ? (
              <div className="rounded-lg border border-gray-200 bg-white px-5 py-10 text-center text-gray-500 shadow-sm">
                <p className="text-lg font-semibold text-[#171717]">כדי לראות מועדפים צריך להתחבר</p>
                <button
                  onClick={promptGoogleSignIn}
                  className="mt-4 h-10 rounded-lg bg-[#171717] px-4 text-sm font-bold text-white transition-colors hover:bg-[#2a2a2a]"
                >
                  התחברות עם Google
                </button>
              </div>
            ) : (
              <>
            {cartWarning && (
              <div
                role="alert"
                className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 shadow-sm"
              >
                {cartWarning}
              </div>
            )}
            <p className="text-xs text-gray-500 mb-2 px-1">
              מציג {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, total).toLocaleString()} מתוך {total.toLocaleString()} {tab === "favourites" ? "מועדפים" : "מוצרים"}
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
                      <th onClick={() => handleSort("item_name")} className="px-4 py-3 text-right text-xs font-bold uppercase whitespace-nowrap select-none cursor-pointer hover:bg-white/10">
                        <span style={{ paddingRight: "7.5rem" }}>שם מוצר{sortIcon("item_name")}</span>
                      </th>
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
                      const unavailable = p.is_available === false;
                      return (
                      <tr
                        key={p.item_code + i}
                        onClick={hasDiscount ? () => setSelectedProduct(p) : undefined}
                        className={`border-b border-gray-100 transition-colors hover:bg-red-50/70 ${hasDiscount ? "cursor-pointer" : ""} ${i % 2 === 1 ? "bg-[#fafafa]" : "bg-white"} ${unavailable ? "opacity-40" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={event => {
                                event.stopPropagation();
                                void toggleFavourite(p.item_code);
                              }}
                              disabled={favouritePendingCode === p.item_code}
                              className={`mt-0.5 h-8 w-8 flex-shrink-0 rounded-lg border text-sm transition-colors ${
                                favouriteCodes.has(p.item_code)
                                  ? "border-[#e31837] bg-red-50 text-[#e31837]"
                                  : "border-gray-200 bg-white text-gray-400 hover:border-[#e31837] hover:text-[#e31837]"
                              } ${favouritePendingCode === p.item_code ? "cursor-wait opacity-60" : ""}`}
                              aria-label={favouriteCodes.has(p.item_code) ? "הסרה ממועדפים" : "שמירה במועדפים"}
                              title={status === "authenticated" ? "שמירה במועדפים" : "נדרשת התחברות עם Google"}
                            >
                              ★
                            </button>
                            <div className="mt-0.5 flex-shrink-0 flex justify-center">
                              {(() => { const cartItem = shoppingList.find(i => i.item_code === p.item_code); return cartItem ? (
                                <div className="flex items-center rounded-lg border border-green-600 bg-green-50 text-green-700 overflow-hidden">
                                  <button type="button" onClick={e => { e.stopPropagation(); void decrementCart(p); }} disabled={shoppingPendingCode === p.item_code} className="h-8 w-7 text-base leading-none hover:bg-green-100 transition-colors disabled:opacity-60" aria-label="הפחת כמות">−</button>
                                  <span className="flex min-w-[1.75rem] items-center justify-center text-center text-sm font-bold tabular-nums">
                                    {shoppingPendingCode === p.item_code ? <InlineSpinner /> : cartItem.quantity}
                                  </span>
                                  <button type="button" onClick={e => { e.stopPropagation(); void addToCart(p); }} disabled={shoppingPendingCode === p.item_code} className="h-8 w-7 text-base leading-none hover:bg-green-100 transition-colors disabled:opacity-60" aria-label="הוסף כמות">+</button>
                                </div>
                              ) : (
                                <button type="button" onClick={e => { e.stopPropagation(); void addToCart(p); }} disabled={shoppingPendingCode === p.item_code} className={`h-8 w-8 rounded-lg border text-sm transition-colors border-gray-200 bg-white text-gray-400 hover:border-green-600 hover:text-green-600 ${shoppingPendingCode === p.item_code ? "cursor-wait opacity-60" : ""}`} aria-label="הוספה לרשימת קניות">
                                  {shoppingPendingCode === p.item_code ? <InlineSpinner /> : "🛒"}
                                </button>
                              ); })()}
                            </div>
                            <button type="button" onClick={e => { e.stopPropagation(); setImageModalProduct(p); }} className="flex-shrink-0">
                              <ProductImage itemCode={p.item_code} itemName={p.item_name} width={40} height={40} className="rounded object-contain hover:opacity-80 transition-opacity" />
                            </button>
                            <div className="min-w-0">
                              <p className="truncate">{p.item_name}</p>
                              {p.category && <p className="mt-0.5 text-xs text-gray-400">{p.category}</p>}
                            </div>
                          </div>
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
                const unavailable = p.is_available === false;
                return (
                <div
                  key={p.item_code + i}
                  onClick={hasDiscount ? () => setSelectedProduct(p) : undefined}
                  className={`flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-colors ${hasDiscount ? "cursor-pointer hover:bg-red-50/70" : ""} ${unavailable ? "opacity-40" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={event => {
                          event.stopPropagation();
                          void toggleFavourite(p.item_code);
                        }}
                        disabled={favouritePendingCode === p.item_code}
                        className={`mt-0.5 h-8 w-8 flex-shrink-0 rounded-lg border text-sm transition-colors ${
                          favouriteCodes.has(p.item_code)
                            ? "border-[#e31837] bg-red-50 text-[#e31837]"
                            : "border-gray-200 bg-white text-gray-400 hover:border-[#e31837] hover:text-[#e31837]"
                        } ${favouritePendingCode === p.item_code ? "cursor-wait opacity-60" : ""}`}
                        aria-label={favouriteCodes.has(p.item_code) ? "הסרה ממועדפים" : "שמירה במועדפים"}
                        title={status === "authenticated" ? "שמירה במועדפים" : "נדרשת התחברות עם Google"}
                      >
                        ★
                      </button>
                      <div className="mt-0.5 flex-shrink-0 flex justify-center">
                        {(() => { const cartItem = shoppingList.find(i => i.item_code === p.item_code); return cartItem ? (
                          <div className="flex items-center rounded-lg border border-green-600 bg-green-50 text-green-700 overflow-hidden">
                            <button type="button" onClick={e => { e.stopPropagation(); void decrementCart(p); }} disabled={shoppingPendingCode === p.item_code} className="h-8 w-7 text-base leading-none hover:bg-green-100 transition-colors disabled:opacity-60" aria-label="הפחת כמות">−</button>
                            <span className="flex min-w-[1.75rem] items-center justify-center text-center text-sm font-bold tabular-nums">
                              {shoppingPendingCode === p.item_code ? <InlineSpinner /> : cartItem.quantity}
                            </span>
                            <button type="button" onClick={e => { e.stopPropagation(); void addToCart(p); }} disabled={shoppingPendingCode === p.item_code} className="h-8 w-7 text-base leading-none hover:bg-green-100 transition-colors disabled:opacity-60" aria-label="הוסף כמות">+</button>
                          </div>
                        ) : (
                          <button type="button" onClick={e => { e.stopPropagation(); void addToCart(p); }} disabled={shoppingPendingCode === p.item_code} className={`h-8 w-8 rounded-lg border text-sm transition-colors border-gray-200 bg-white text-gray-400 hover:border-green-600 hover:text-green-600 ${shoppingPendingCode === p.item_code ? "cursor-wait opacity-60" : ""}`} aria-label="הוספה לרשימת קניות">
                            {shoppingPendingCode === p.item_code ? <InlineSpinner /> : "🛒"}
                          </button>
                        ); })()}
                      </div>
                      <button type="button" onClick={e => { e.stopPropagation(); setImageModalProduct(p); }} className="flex-shrink-0">
                        <ProductImage itemCode={p.item_code} itemName={p.item_name} width={40} height={40} className="rounded object-contain hover:opacity-80 transition-opacity" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm leading-snug truncate">{p.item_name}</p>
                        {p.category && <p className="mt-0.5 text-xs text-gray-400">{p.category}</p>}
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {p.manufacturer_name && <span>{p.manufacturer_name} · </span>}
                      <span dir="ltr" className="font-mono">{p.item_code}</span>
                    </p>
                    {hasDiscount && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
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
                    <div className="flex items-start gap-3">
                      {(promo.original_items ?? []).length > 0 && (
                        <div className="flex flex-shrink-0 gap-1">
                          {(promo.original_items ?? []).slice(0, 1).map(item => (
                            <NextImage
                              key={item.item_code}
                              src={`/victory-gt/products/${item.item_code}.jpg`}
                              alt={item.item_name}
                              width={48}
                              height={48}
                              className="h-12 w-12 rounded-md border border-gray-100 object-contain bg-white"
                              onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                            />
                          ))}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold leading-snug text-[#171717]">
                          {promo.description || `מבצע #${promo.promotion_id}`}
                        </p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mt-2">
                          {promo.discounted_price && <span>מחיר: <strong className="text-green-700">{formatCurrency(promo.discounted_price)}</strong></span>}
                          {(positiveNumber(promo.min_qty) ?? 0) > 1 && <span>מינ׳ כמות: {promo.min_qty}</span>}
                          {promo.max_qty && <span>מקס׳ כמות: {promo.max_qty}</span>}
                          {positiveNumber(promo.min_purchase_amount) && <span>מינ׳ קנייה: <strong className="text-gray-700">{formatCurrency(promo.min_purchase_amount)}</strong></span>}
                          {promo.end_date && <span className="text-xs text-gray-400">עד {String(promo.end_date).slice(0, 10)}</span>}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
              <Pagination page={page} pages={promoPages} onPage={setPage} />
            </div>
          </>
        )}

        {tab === "shopping" && (
          <ShoppingListView
            household={household}
            householdPending={householdPending}
            shoppingPendingCode={shoppingPendingCode}
            items={shoppingList}
            status={status}
            onToggleChecked={toggleChecked}
            onAdd={(item) => addToCart(item)}
            onDecrement={(item) => decrementCart(item)}
            onRemove={async (item: ShoppingListItem) => {
              setShoppingList(current => current.filter(i => i.item_code !== item.item_code));
              await fetch("/victory-gt/api/shopping-list", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ itemCode: item.item_code, force: true }),
              });
            }}
            onResetCart={resetCart}
            onSignIn={promptGoogleSignIn}
            onJoinHousehold={joinHousehold}
          />
        )}
      </div>
      {imageModalProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setImageModalProduct(null)}
        >
          <div className="relative flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setImageModalProduct(null)}
              className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-600 shadow-lg hover:text-black"
              aria-label="סגור"
            >
              ✕
            </button>
            <ProductImage
              itemCode={imageModalProduct.item_code}
              itemName={imageModalProduct.item_name}
              width={300}
              height={300}
              className="rounded-lg object-contain bg-white p-2 shadow-2xl"
            />
            <p className="text-white text-sm font-semibold text-center drop-shadow">{imageModalProduct.item_name}</p>
          </div>
        </div>
      )}
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
          shoppingList={shoppingList}
          shoppingPendingCode={shoppingPendingCode}
          onAddToCart={(item) => addToCart({ item_code: item.item_code, item_name: item.item_name, item_price: item.item_price, is_available: item.is_available })}
          onDecrementCart={(item) => decrementCart({ item_code: item.item_code })}
          positiveNumber={positiveNumber}
        />
      )}
      {scannerOpen && (
        <BarcodeScannerModal
          videoRef={scannerVideoRef}
          cameraActive={scannerCameraActive}
          status={scannerStatus}
          error={scannerError}
          scannedCode={scannerCode}
          loadingProduct={scannerLoadingProduct}
          product={scannerProduct}
          favouriteCodes={favouriteCodes}
          favouritePendingCode={favouritePendingCode}
          shoppingList={shoppingList}
          shoppingPendingCode={shoppingPendingCode}
          statusAuth={status}
          onClose={closeScanner}
          onRetry={() => { void startScanner(); }}
          onAddToCart={addToCart}
          onToggleFavourite={toggleFavourite}
          onShowPromos={product => {
            closeScanner();
            setSelectedProduct(product);
          }}
          onSignIn={promptGoogleSignIn}
        />
      )}
    </div>
    </>
  );
}

function TabBtn({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`min-w-0 rounded-lg border px-2 py-2 text-center text-xs font-bold leading-tight transition-all sm:h-10 sm:px-4 sm:text-sm sm:whitespace-nowrap ${
        active ? "border-[#e31837] bg-[#e31837] text-white shadow-sm" : "border-red-200 bg-white text-[#e31837] hover:border-[#e31837] hover:bg-red-50"
      }`}
    >
      {children}
    </button>
  );
}

function ShoppingListView({
  household,
  householdPending,
  shoppingPendingCode,
  items,
  status,
  onToggleChecked,
  onAdd,
  onDecrement,
  onRemove,
  onResetCart,
  onSignIn,
  onJoinHousehold,
}: {
  household: HouseholdInfo | null;
  householdPending: boolean;
  shoppingPendingCode: string | null;
  items: ShoppingListItem[];
  status: string;
  onToggleChecked: (item: ShoppingListItem) => void;
  onAdd: (item: ShoppingListItem) => void;
  onDecrement: (item: ShoppingListItem) => void;
  onRemove: (item: ShoppingListItem) => void;
  onResetCart: () => void;
  onSignIn: () => void;
  onJoinHousehold: (inviteCode: string) => void | Promise<void>;
}) {
  if (status !== "authenticated") {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-5 py-10 text-center text-gray-500 shadow-sm">
        <p className="text-lg font-semibold text-[#171717]">כדי להשתמש ברשימת קניות צריך להתחבר</p>
        <button
          onClick={onSignIn}
          className="mt-4 h-10 rounded-lg bg-[#171717] px-4 text-sm font-bold text-white transition-colors hover:bg-[#2a2a2a]"
        >
          התחברות עם Google
        </button>
      </div>
    );
  }

  const unchecked = items.filter(i => !i.checked);
  const checked = items.filter(i => i.checked);
  const total = items.reduce((sum, i) => sum + i.item_price * i.quantity, 0);
  const groupByCategory = (list: ShoppingListItem[]) => {
    const groups = new Map<string, ShoppingListItem[]>();
    for (const item of list) {
      const categoryName = item.category?.trim() || "ללא קטגוריה";
      groups.set(categoryName, [...(groups.get(categoryName) ?? []), item]);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, "he"));
  };

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-200 bg-white px-5 py-16 text-center text-gray-400 shadow-sm">
          <p className="text-4xl mb-3">🛒</p>
          <p className="text-lg font-semibold text-[#171717]">רשימת הקניות ריקה</p>
          <p className="mt-1 text-sm">לחץ על 🛒 ליד מוצר כדי להוסיף אותו</p>
        </div>
        <HouseholdPanel household={household} pending={householdPending} onJoin={onJoinHousehold} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between px-1" dir="rtl">
        <p className="text-sm text-gray-500">
          {unchecked.length} פריטים נותרו · סה״כ משוער{" "}
          <strong className="text-green-700">₪{total.toFixed(2)}</strong>
        </p>
        <button
          onClick={onResetCart}
          className="text-xs font-semibold text-gray-400 hover:text-[#e31837] transition-colors"
        >
          אפס עגלה
        </button>
      </div>

      <div className="space-y-2">
        {groupByCategory(unchecked).map(([categoryName, categoryItems]) => (
          <div key={`unchecked-${categoryName}`} className="space-y-2">
            <p className="px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{categoryName}</p>
            {categoryItems.map(item => (
              <ShoppingListRow key={item.item_code} item={item} shoppingPendingCode={shoppingPendingCode} promoLabel={item.promo_label ?? undefined} onToggle={onToggleChecked} onAdd={onAdd} onDecrement={onDecrement} onRemove={onRemove} />
            ))}
          </div>
        ))}
        {checked.length > 0 && (
          <>
            <p className="pt-2 pb-1 px-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">נאסף</p>
            {groupByCategory(checked).map(([categoryName, categoryItems]) => (
              <div key={`checked-${categoryName}`} className="space-y-2">
                <p className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-300">{categoryName}</p>
                {categoryItems.map(item => (
                  <ShoppingListRow key={item.item_code} item={item} shoppingPendingCode={shoppingPendingCode} promoLabel={item.promo_label ?? undefined} onToggle={onToggleChecked} onAdd={onAdd} onDecrement={onDecrement} onRemove={onRemove} />
                ))}
              </div>
            ))}
          </>
        )}
      </div>
      <div className="mt-6">
        <HouseholdPanel household={household} pending={householdPending} onJoin={onJoinHousehold} />
      </div>
    </div>
  );
}

function HouseholdPanel({
  household,
  pending,
  onJoin,
}: {
  household: HouseholdInfo | null;
  pending: boolean;
  onJoin: (inviteCode: string) => void | Promise<void>;
}) {
  const [inviteCode, setInviteCode] = useState("");
  const [copied, setCopied] = useState(false);

  const copyCode = useCallback(async () => {
    if (!household?.inviteCode) return;

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(household.inviteCode);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
        return;
      }
    } catch {
      // Fall back to alert below.
    }

    if (typeof window !== "undefined") window.alert(`קוד השיתוף שלך: ${household.inviteCode}`);
  }, [household]);

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[#171717]">עגלה משותפת</p>
          <p className="mt-1 text-xs text-gray-500">
            {household ? `${household.memberCount} חברים במשק הבית` : "טוען פרטי שיתוף..."}
          </p>
        </div>
        {household && (
          <div className="flex items-center gap-2" dir="ltr">
            <span className="rounded-lg border border-gray-200 bg-[#f7f8fa] px-3 py-2 text-sm font-bold tracking-[0.2em] text-[#171717]">
              {household.inviteCode}
            </span>
            <button
              type="button"
              onClick={() => { void copyCode(); }}
              className="h-10 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-600 transition-colors hover:border-[#e31837] hover:text-[#e31837]"
            >
              {copied ? "הועתק" : "העתק קוד"}
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={inviteCode}
          onChange={event => setInviteCode(event.target.value.toUpperCase())}
          placeholder="הזינו קוד שיתוף"
          className="h-10 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold tracking-[0.2em] text-[#171717] focus:border-[#e31837] focus:outline-none focus:ring-2 focus:ring-[#e31837]/15"
          dir="ltr"
        />
        <button
          type="button"
          disabled={pending || !inviteCode.trim()}
          onClick={() => {
            void onJoin(inviteCode.trim());
            setInviteCode("");
          }}
          className={`h-10 rounded-lg bg-[#171717] px-4 text-sm font-bold text-white transition-colors hover:bg-[#2a2a2a] ${pending ? "cursor-wait opacity-60" : ""}`}
        >
          הצטרף לעגלה
        </button>
      </div>
      <p className="mt-2 text-xs text-gray-400">שתף את הקוד עם בני ביתך כדי שכולכם תראו ותעדכנו את אותה עגלה.</p>
    </div>
  );
}

function BarcodeScannerModal({
  videoRef,
  cameraActive,
  status,
  error,
  scannedCode,
  loadingProduct,
  product,
  favouriteCodes,
  favouritePendingCode,
  shoppingList,
  shoppingPendingCode,
  statusAuth,
  onClose,
  onRetry,
  onAddToCart,
  onToggleFavourite,
  onShowPromos,
  onSignIn,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  cameraActive: boolean;
  status: string;
  error: string | null;
  scannedCode: string | null;
  loadingProduct: boolean;
  product: Product | null;
  favouriteCodes: Set<string>;
  favouritePendingCode: string | null;
  shoppingList: ShoppingListItem[];
  shoppingPendingCode: string | null;
  statusAuth: string;
  onClose: () => void;
  onRetry: () => void;
  onAddToCart: (product: { item_code: string; item_name: string; item_price: number; category?: string | null; is_available?: boolean }) => void | Promise<void>;
  onToggleFavourite: (itemCode: string) => void | Promise<void>;
  onShowPromos: (product: Product) => void;
  onSignIn: () => void;
}) {
  const cartItem = product ? shoppingList.find(item => item.item_code === product.item_code) : null;
  const unavailable = product?.is_available === false;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 sm:hidden">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-4 py-3 text-white">
          <div>
            <p className="text-sm font-bold">סריקת ברקוד</p>
            <p className="text-xs text-white/70">{status}</p>
          </div>
          {cameraActive && (
            <button type="button" onClick={onClose} className="h-10 w-10 rounded-full border border-white/20 text-lg leading-none text-white">
              ×
            </button>
          )}
        </div>

        {(cameraActive || !product) && (
          <div className="relative mx-4 overflow-hidden rounded-2xl border border-white/10 bg-black">
            <video
              ref={videoRef}
              className={`aspect-[3/4] w-full object-cover ${cameraActive ? "" : "invisible"}`}
              playsInline
              muted
              autoPlay
            />
            {cameraActive ? (
              <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-2xl border-2 border-[#e31837] shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/70">
                המצלמה כבויה כרגע
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {!error && (
            <p className="mb-4 text-center text-xs text-white/70">
              לתוצאות טובות יותר החזיקו את הטלפון מעט רחוק יותר מהברקוד ותנו למצלמה רגע להתפקס.
            </p>
          )}

          {error && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              <p>{error}</p>
              <button type="button" onClick={onRetry} className="mt-2 text-xs underline underline-offset-2">נסה שוב</button>
            </div>
          )}

          {!error && loadingProduct && (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-5 text-center text-sm text-white">
              <InlineSpinner />
              <p className="mt-3">טוען פרטי מוצר...</p>
            </div>
          )}

          {!error && !loadingProduct && scannedCode && !product && (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-5 text-center text-sm text-white">
              <p>לא נמצא מוצר עבור הברקוד</p>
              <p className="mt-1 font-mono text-white/70">{scannedCode}</p>
              <button type="button" onClick={onRetry} className="mt-3 rounded-lg bg-white px-4 py-2 text-xs font-bold text-[#171717]">סרוק שוב</button>
            </div>
          )}

          {product && (
            <div className="mt-4 rounded-2xl bg-white p-4 shadow-xl">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (statusAuth !== "authenticated") {
                      onSignIn();
                      return;
                    }
                    void onToggleFavourite(product.item_code);
                  }}
                  disabled={favouritePendingCode === product.item_code}
                  className={`mt-0.5 h-9 w-9 flex-shrink-0 rounded-lg border text-sm transition-colors ${
                    favouriteCodes.has(product.item_code)
                      ? "border-[#e31837] bg-red-50 text-[#e31837]"
                      : "border-gray-200 bg-white text-gray-400 hover:border-[#e31837] hover:text-[#e31837]"
                  } ${favouritePendingCode === product.item_code ? "cursor-wait opacity-60" : ""}`}
                  aria-label={favouriteCodes.has(product.item_code) ? "הסרה ממועדפים" : "שמירה במועדפים"}
                >
                  ★
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-[#171717]">{product.item_name}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    <span dir="ltr" className="font-mono">{product.item_code}</span>
                    {product.category && <span> · {product.category}</span>}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div>
                  <p className="text-2xl font-black text-green-700">₪{Number(product.item_price).toFixed(2)}</p>
                  {product.unit_of_measure && <p className="mt-1 text-xs text-gray-400">{product.unit_of_measure}</p>}
                </div>
                {cartItem ? (
                  <div className="flex items-center rounded-lg border border-green-600 bg-green-50 text-green-700 overflow-hidden">
                    <button type="button" onClick={() => { void onAddToCart({ item_code: product.item_code, item_name: product.item_name, item_price: product.item_price, category: product.category, is_available: product.is_available }); }} disabled={shoppingPendingCode === product.item_code} className="h-9 w-8 text-base leading-none hover:bg-green-100 transition-colors disabled:opacity-60" aria-label="הוסף כמות">+</button>
                    <span className="flex min-w-[2rem] items-center justify-center text-sm font-bold tabular-nums">
                      {shoppingPendingCode === product.item_code ? <InlineSpinner /> : cartItem.quantity}
                    </span>
                    <button type="button" onClick={onRetry} className="hidden" aria-hidden="true" />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { void onAddToCart({ item_code: product.item_code, item_name: product.item_name, item_price: product.item_price, category: product.category, is_available: product.is_available }); }}
                    disabled={shoppingPendingCode === product.item_code}
                    className={`rounded-lg bg-[#171717] px-4 py-2 text-sm font-bold text-white ${shoppingPendingCode === product.item_code ? "opacity-60" : ""}`}
                  >
                    {shoppingPendingCode === product.item_code ? <InlineSpinner /> : "הוסף לעגלה"}
                  </button>
                )}
              </div>

              {unavailable && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                  מוצר זה כרגע אזל מהמלאי
                </p>
              )}

              {(product.discount_promos?.length ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() => onShowPromos(product)}
                  className="mt-4 w-full rounded-lg bg-[#e31837] px-4 py-2 text-sm font-bold text-white"
                >
                  צפה ב-{product.discount_promos?.length} מבצעים
                </button>
              )}

              <button type="button" onClick={onRetry} className="mt-3 w-full rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600">
                סרוק מוצר נוסף
              </button>
              <button type="button" onClick={onClose} className="mt-3 w-full rounded-lg bg-[#171717] px-4 py-2 text-sm font-bold text-white">
                סגור
              </button>
            </div>
          )}

          {!cameraActive && !product && (
            <button type="button" onClick={onClose} className="mt-4 w-full rounded-lg bg-white px-4 py-2 text-sm font-bold text-[#171717]">
              סגור
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ShoppingListRow({
  item,
  shoppingPendingCode,
  promoLabel,
  onToggle,
  onAdd,
  onDecrement,
  onRemove,
}: {
  item: ShoppingListItem;
  shoppingPendingCode: string | null;
  promoLabel?: string;
  onToggle: (item: ShoppingListItem) => void;
  onAdd: (item: ShoppingListItem) => void;
  onDecrement: (item: ShoppingListItem) => void;
  onRemove: (item: ShoppingListItem) => void;
}) {
  const [lightbox, setLightbox] = useState(false);
  return (
    <>
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 cursor-zoom-out"
          onClick={() => setLightbox(false)}
        >
          <div className="relative max-h-[80vh] max-w-[80vw] h-[80vh] w-[80vw]">
            <NextImage
              src={`/victory-gt/products/${item.item_code}.jpg`}
              alt={item.item_name}
              fill
              className="rounded-xl object-contain"
            />
          </div>
        </div>
      )}
    <div className={`grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-3 rounded-lg border bg-white p-4 shadow-sm transition-colors ${item.checked ? "border-gray-100 opacity-60" : "border-gray-200"}`}>
      {/* checkbox */}
      <button
        type="button"
        onClick={() => onToggle(item)}
        className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded border-2 transition-colors ${item.checked ? "border-green-500 bg-green-500" : "border-gray-300 hover:border-green-500"}`}
        aria-label={item.checked ? "סמן כלא נאסף" : "סמן כנאסף"}
      >
        {item.checked && <span className="text-white text-xs font-bold leading-none">✓</span>}
      </button>
      {/* product image */}
      <NextImage
        src={`/victory-gt/products/${item.item_code}.jpg`}
        alt={item.item_name}
        width={40}
        height={40}
        className="h-10 w-10 flex-shrink-0 rounded-md border border-gray-100 object-contain bg-white cursor-zoom-in"
        onClick={() => setLightbox(true)}
        onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      />
      {/* name + barcode */}
      <div className="min-w-0 text-right">
        <p className={`font-semibold text-sm leading-snug ${item.checked ? "line-through text-gray-400" : "text-[#171717]"}`}>
          {item.item_name}
        </p>
        <p className="text-xs text-gray-400 mt-0.5 font-mono" dir="ltr">{item.item_code}</p>
        {promoLabel && !item.checked && (
          <span className="mt-1 inline-block rounded border border-[#e31837]/30 bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-[#e31837]">{promoLabel}</span>
        )}
      </div>
      {/* qty + price */}
      <div className="flex flex-col items-end gap-1">
        <div className={`flex items-center rounded-lg border overflow-hidden ${item.checked ? "border-gray-200 text-gray-300" : "border-green-600 text-green-700"}`}>
          <button type="button" onClick={() => onDecrement(item)} className="h-7 w-6 text-sm leading-none hover:bg-green-50 transition-colors" aria-label="הפחת כמות">−</button>
          <span className="flex min-w-[1.25rem] items-center justify-center text-center text-sm font-bold tabular-nums">
            {shoppingPendingCode === item.item_code ? <InlineSpinner /> : item.quantity}
          </span>
          <button type="button" onClick={() => onAdd(item)} disabled={shoppingPendingCode === item.item_code} className="h-7 w-6 text-sm leading-none hover:bg-green-50 transition-colors disabled:opacity-60" aria-label="הוסף כמות">+</button>
        </div>
        <p className={`text-xs font-bold whitespace-nowrap tabular-nums ${item.checked ? "text-gray-300" : "text-green-700"}`} dir="ltr">
          ₪{(item.item_price * item.quantity).toFixed(2)}
          {item.quantity > 1 && <span className="font-normal text-gray-400"> (₪{item.item_price.toFixed(2)} ליח׳)</span>}
        </p>
      </div>
      {/* remove */}
      <button
        type="button"
        onClick={() => onRemove(item)}
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:border-[#e31837] hover:text-[#e31837] transition-colors text-base leading-none"
        aria-label="הסרה מהרשימה"
      >
        ×
      </button>
    </div>
    </>
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
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

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
          <div className="flex items-start gap-3">
            <div
              className={`relative flex-shrink-0 rounded-md border border-gray-100 bg-white cursor-pointer transition-all duration-200 ${expandedImage === product.item_code ? "h-40 w-40" : "h-16 w-16"}`}
              onClick={e => { e.stopPropagation(); setExpandedImage(expandedImage === product.item_code ? null : product.item_code); }}
            >
              <NextImage
                src={`/victory-gt/products/${product.item_code}.jpg`}
                alt={product.item_name}
                fill
                className="object-contain"
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            </div>
            <div>
              <h2 className="text-lg font-black text-[#171717]">{product.item_name}</h2>
              <p className="mt-1 text-sm text-gray-500">
                מחיר רגיל: <strong className="text-green-700">{formatCurrency(product.item_price)}</strong>
              </p>
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
                  {(positiveNumber(promo.min_qty) ?? 0) > 1 && <span>מינ׳ כמות: {promo.min_qty}</span>}
                  {promo.max_qty && <span>מקס׳ כמות: {promo.max_qty}</span>}
                  {positiveNumber(promo.min_purchase_amount) && <span>מינ׳ קנייה: <strong className="text-gray-700">{formatCurrency(promo.min_purchase_amount)}</strong></span>}
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
                          <div className="flex gap-2">
                            <div
                              className={`relative flex-shrink-0 rounded-md border border-gray-100 bg-white cursor-pointer transition-all duration-200 ${expandedImage === item.item_code ? "h-32 w-32" : "h-12 w-12"}`}
                              onClick={() => setExpandedImage(expandedImage === item.item_code ? null : item.item_code)}
                            >
                              <NextImage
                                src={`/victory-gt/products/${item.item_code}.jpg`}
                                alt={item.item_name}
                                fill
                                className="object-contain"
                                onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                              />
                            </div>
                            <div>
                              <p className="font-semibold leading-snug text-[#171717]">{item.item_name || item.item_code}</p>
                              <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                                <span>מחיר רגיל: <strong className="text-[#171717]">{formatCurrency(item.item_price)}</strong></span>
                                <span className="text-xs text-gray-400">
                                ברקוד: <span dir="ltr" className="font-mono">{item.item_code}</span>
                                </span>
                              </div>
                            </div>
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
  shoppingList,
  shoppingPendingCode,
  onAddToCart,
  onDecrementCart,
}: {
  promo: Promo;
  onClose: () => void;
  itemCodes: (raw: string | string[]) => string[];
  formatCurrency: (value: number | string) => string;
  positiveNumber: (value: string) => number | null;
  shoppingList: ShoppingListItem[];
  shoppingPendingCode: string | null;
  onAddToCart: (item: PromoOriginalItem) => void;
  onDecrementCart: (item: PromoOriginalItem) => void;
}) {
  const codes = itemCodes(promo.item_codes);
  const minQty = positiveNumber(promo.min_qty);
  const discountedPrice = positiveNumber(promo.discounted_price);
  const originalItems = promo.original_items ?? [];
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

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
              {(positiveNumber(promo.min_qty) ?? 0) > 1 && <span>מינ׳ כמות: {promo.min_qty}</span>}
              {promo.max_qty && <span>מקס׳ כמות: {promo.max_qty}</span>}
              {positiveNumber(promo.min_purchase_amount) && <span>מינ׳ קנייה: <strong className="text-gray-700">{formatCurrency(promo.min_purchase_amount)}</strong></span>}
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
              const unavailable = item.is_available === false;
              const cartItem = shoppingList.find(i => i.item_code === item.item_code);
              return (
                <div key={item.item_code} className={`rounded-lg border border-gray-200 bg-[#fafafa] p-3 ${unavailable ? "opacity-40" : ""}`}>
                  <div className="flex gap-3">
                    <div
                      className={`relative flex-shrink-0 rounded-md border border-gray-100 bg-white cursor-pointer transition-all duration-200 ${expandedImage === item.item_code ? "h-40 w-40" : "h-16 w-16"}`}
                      onClick={() => setExpandedImage(expandedImage === item.item_code ? null : item.item_code)}
                    >
                      <NextImage
                        src={`/victory-gt/products/${item.item_code}.jpg`}
                        alt={item.item_name}
                        fill
                        className="object-contain"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <p className="font-bold text-[#171717]">{item.item_name || item.item_code}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">
                            ברקוד: <span dir="ltr" className="font-mono">{item.item_code}</span>
                          </span>
                          {cartItem ? (
                            <div className="flex items-center rounded-lg border border-green-600 bg-green-50 text-green-700 overflow-hidden">
                              <button onClick={() => onDecrementCart(item)} className="h-8 w-7 text-base leading-none hover:bg-green-100 transition-colors" aria-label="הפחת כמות">−</button>
                              <span className="flex min-w-[1.25rem] items-center justify-center text-center text-sm font-bold tabular-nums">
                                {shoppingPendingCode === item.item_code ? <InlineSpinner /> : cartItem.quantity}
                              </span>
                              <button onClick={() => onAddToCart(item)} disabled={shoppingPendingCode === item.item_code} className="h-8 w-7 text-base leading-none hover:bg-green-100 transition-colors disabled:opacity-60" aria-label="הוסף כמות">+</button>
                            </div>
                          ) : (
                            <button onClick={() => onAddToCart(item)} disabled={shoppingPendingCode === item.item_code} className={`h-8 w-8 flex-shrink-0 rounded-lg border border-gray-200 bg-white text-sm text-gray-400 hover:border-green-600 hover:text-green-600 transition-colors ${shoppingPendingCode === item.item_code ? "cursor-wait opacity-60" : ""}`} aria-label="הוספה לרשימת קניות">
                              {shoppingPendingCode === item.item_code ? <InlineSpinner /> : "🛒"}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                        {promo.discount_rate && <span>הנחה לפריט: <strong className="text-[#e31837]">₪{promo.discount_rate}</strong></span>}
                        {savings && savings > 0 && <span>חיסכון כולל: <strong className="text-[#e31837]">{formatCurrency(savings)}</strong></span>}
                        <span>מקורי ליחידה: <strong className="text-[#171717]">{formatCurrency(item.item_price)}</strong></span>
                        {originalMinPrice && (
                          <span>מקורי למינ׳: <strong className="text-[#171717]">{formatCurrency(originalMinPrice)}</strong></span>
                        )}
                        {unavailable && <span className="font-semibold text-amber-800">כרגע אזל מהמלאי</span>}
                      </div>
                    </div>
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

function InlineSpinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent align-middle" aria-hidden="true" />;
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

function ProductImage({ itemCode, itemName, width, height, className }: { itemCode: string; itemName: string; width: number; height: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className={`block bg-gray-100 rounded ${className}`} style={{ width, height }} />;
  }
  return (
    <NextImage
      src={`${PRODUCT_IMAGES_BASE}/products/${itemCode}.jpg`}
      alt={itemName}
      width={width}
      height={height}
      className={className}
      onError={() => setFailed(true)}
    />
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
