"use client";

import { PoweredByEasyDine } from "@/components/order/powered-by";
import { VoiceOrder, type VoiceAddLine, type VoiceMenuItem } from "@/components/order/voice-order";
import { LOCALES, useI18n } from "@/lib/i18n/context";
import { GamesDialog, getStoredGameSettings } from "@/components/order/games";
import { RECOGNITION_LANG } from "@/lib/voice-order";
import {
  ArrowLeft,
  BellRing,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Menu as MenuIcon,
  Mic,
  Minus,
  PenTool,
  Phone,
  Plus,
  Receipt,
  Search,
  Sparkles,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { playSuccessChime, vibrateSuccess } from "@/lib/celebrate";
import { formatCurrency, formatOrderNumber } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  DeliveryRedirectBanner,
  PaidPointsCard,
  PointsChip,
  ReviewButton,
  usePaidSummary,
  type PublicDeliveryRedirect,
  type PublicLoyaltyConfig,
} from "@/components/order/qr-extras";

// Dish images fallbacks
const DISH_IMAGE_FALLBACKS: Record<string, string> = {
  starters: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=500&auto=format&fit=crop&q=80",
  main: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500&auto=format&fit=crop&q=80",
  rice: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=500&auto=format&fit=crop&q=80",
  breads: "https://images.unsplash.com/photo-1626074353765-517a681e40be?w=500&auto=format&fit=crop&q=80",
  drinks: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&auto=format&fit=crop&q=80",
  dessert: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=500&auto=format&fit=crop&q=80",
  default: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500&auto=format&fit=crop&q=80",
};

function getDishImage(item: { name: string; imageUrl?: string | null }, catName: string = ""): string {
  const lowerCat = (catName || "").toLowerCase();
  const lowerName = (item.name || "").toLowerCase();

  const getFallback = () => {
    if (lowerName.includes("biryani") || lowerName.includes("rice") || lowerCat.includes("rice")) return DISH_IMAGE_FALLBACKS.rice;
    if (lowerName.includes("roti") || lowerName.includes("naan") || lowerName.includes("bread") || lowerCat.includes("bread")) return DISH_IMAGE_FALLBACKS.breads;
    if (lowerName.includes("tikka") || lowerName.includes("kebab") || lowerName.includes("corn") || lowerCat.includes("starter")) return DISH_IMAGE_FALLBACKS.starters;
    if (lowerName.includes("shake") || lowerName.includes("drink") || lowerName.includes("lemonade") || lowerCat.includes("beverage")) return DISH_IMAGE_FALLBACKS.drinks;
    if (lowerName.includes("ice cream") || lowerName.includes("kulfi") || lowerCat.includes("dessert")) return DISH_IMAGE_FALLBACKS.dessert;
    if (lowerCat.includes("main") || lowerName.includes("dal") || lowerName.includes("curry") || lowerName.includes("paneer") || lowerName.includes("mutter")) return DISH_IMAGE_FALLBACKS.main;
    return DISH_IMAGE_FALLBACKS.default;
  };

  const raw = item.imageUrl?.trim();
  if (raw && !raw.includes("null") && !raw.includes("undefined")) {
    if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("data:")) {
      return raw;
    }
    if (raw.startsWith("/")) {
      return raw;
    }
    if (raw.startsWith("uploads/") || raw.startsWith("api/")) {
      return `/${raw}`;
    }
  }
  return getFallback();
}

function formatDeviceTime(val?: string | null): string {
  if (!val) return "";
  try {
    // If backend sent a bare time like "04:39 AM" or "4:39 PM" (UTC from server formatter)
    const match = val.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const meridiem = match[4]?.toUpperCase();
      if (meridiem === "PM" && hours < 12) hours += 12;
      if (meridiem === "AM" && hours === 12) hours = 0;
      const now = new Date();
      const utcDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hours, minutes));
      return utcDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    return val;
  } catch {
    return val || "";
  }
}

interface PublicMenuItem {
  id: string;
  name: string;
  description: string | null;
  price: string;
  imageUrl?: string | null;
  isVeg: boolean;
  isCombo?: boolean;
  comboComponents?: {
    id: string;
    quantity: number;
    componentItem: {
      id: string;
      name: string;
      price: string;
      isActive: boolean;
    };
  }[];
  modifierGroups?: {
    modifierGroup: {
      id: string;
      name: string;
      minSelect: number;
      maxSelect: number;
      isRequired: boolean;
      modifiers: { id: string; name: string; priceAdjustment: string; isDefault: boolean }[];
    };
  }[];
}

interface CartLine {
  id: string;
  menuItemId: string;
  name: string;
  imageUrl?: string;
  isVeg: boolean;
  modifierIds: string[];
  modifierLabel: string;
  unitPrice: number;
  quantity: number;
  cookingNote: string;
}

interface PublicStatus {
  order: {
    orderNumber: string;
    status: string;
    acceptance: string;
    placedAt?: string;
    acceptedAt?: string;
    preparedAt?: string;
    servedAt?: string;
    items: {
      id: string;
      nameSnapshot: string;
      quantity: number;
      status: string;
      unitPriceSnapshot?: string;
      lineTotal?: string;
      kitchenNote?: string;
      modifiers?: { id: string; nameSnapshot: string; priceAdjSnapshot?: string | number }[];
    }[];
    totalAmount?: string;
    paymentStatus?: string;
  } | null;
  openRequests: ("WAITER" | "BILL")[];
  waiterAcknowledged?: boolean;
}

interface PublicMenuCategory {
  id: string;
  name: string;
  items: PublicMenuItem[];
}

interface PublicMenuResponse {
  branchName: string;
  tableName: string;
  tableNumber?: string;
  isTakeaway?: boolean;
  /** Staff marked this table Out of service: show the notice only. */
  outOfService?: boolean;
  message?: string;
  categories: PublicMenuCategory[];
  loyalty?: PublicLoyaltyConfig;
  deliveryRedirect?: PublicDeliveryRedirect | null;
  reviewUrl?: string | null;
}

export default function LuxuryCustomerMenu({
  params,
}: {
  params: Promise<{ qrToken: string }>;
}) {
  const { qrToken } = use(params);
  // Takeaway QRs are /order/takeaway-<opaque branch token>; the backend decides
  // whether the token is valid (bare "takeaway" no longer resolves).
  const isTakeaway = qrToken.startsWith("takeaway-");
  const [isOffline, setIsOffline] = useState(typeof navigator !== "undefined" ? !navigator.onLine : false);
  useEffect(() => {
    const up = () => setIsOffline(false);
    const down = () => setIsOffline(true);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  const nameStorageKey = `qr-guest-name:${qrToken}`;
  const phoneStorageKey = `qr-guest-phone:${qrToken}`;
  const orderIdStorageKey = `qr-active-order:${qrToken}`;
  const queryClient = useQueryClient();

  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  // Customer identity: Name + Contact (per user demand)
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");

  // Cart & Placed status (persists across page refresh)
  const [cart, setCart] = useState<CartLine[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const key = "easy-dine-cart-" + qrToken;
      const saved = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [showGamesModal, setShowGamesModal] = useState(false);
  const handleCloseGames = useCallback(() => {
    setShowGamesModal(false);
  }, []);
  const [viewMode, setViewMode] = useState<"MENU" | "TRACKING">("MENU");

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [dietFilter, setDietFilter] = useState<"ALL" | "VEG" | "POPULAR" | "SPICY" | "BREADS">("ALL");

  // Modals
  const [customizingItem, setCustomizingItem] = useState<{ item: PublicMenuItem; categoryName: string } | null>(null);
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([]);
  // The app's language drives speech recognition: en -> en-IN, hi -> hi-IN, mr -> mr-IN.
  const { locale, setLocale } = useI18n();
  const [cookingNote, setCookingNote] = useState("");
  const [currentRequestId, setCurrentRequestId] = useState<string>(() => "req_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9));
  const [customizingQty, setCustomizingQty] = useState(1);
  const [isListeningCustomMic, setIsListeningCustomMic] = useState(false);
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [showCartDrawer, setShowCartDrawer] = useState(false);
  const [showWaiterModal, setShowWaiterModal] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);
  const [showConfirmOrderModal, setShowConfirmOrderModal] = useState(false);

  // Whether we have loaded the initial menu from the server.
  const [sessionVerified, setSessionVerified] = useState(false);

  // Snapshot of the last ACTIVE order when cashier marks it paid.
  // Since the backend never returns PAID orders (only OPEN/BILLED), when
  // status.order flips from a live order → null while we are in TRACKING mode,
  // we capture the order info here so the Thank You screen can display it.
  const [justPaidSnapshot, setJustPaidSnapshot] = useState<{
    orderNumber: string;
    totalAmount?: string;
    items: { nameSnapshot: string; quantity: number; unitPriceSnapshot?: string; lineTotal?: string }[];
  } | null>(null);

  // Sync cart to storage so cart survives page refresh
  useEffect(() => {
    try {
      const key = "easy-dine-cart-" + qrToken;
      if (cart.length > 0) {
        localStorage.setItem(key, JSON.stringify(cart));
        sessionStorage.setItem(key, JSON.stringify(cart));
      } else {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      }
    } catch {}
  }, [cart, qrToken]);

  // Restore saved credentials from sessionStorage on mount.
  // Note: sessionStorage is isolated per tab. Restoring them ensures a guest
  // browsing or ordering does not get wiped while on the page.
  useEffect(() => {
    const savedName = sessionStorage.getItem(nameStorageKey);
    const savedPhone = sessionStorage.getItem(phoneStorageKey);
    const savedOrderId = sessionStorage.getItem(orderIdStorageKey);
    if (savedName) {
      setGuestName(savedName);
      setNameDraft(savedName);
    }
    if (savedPhone) {
      setGuestPhone(savedPhone);
      setPhoneDraft(savedPhone);
    }
    if (savedOrderId) {
      setActiveOrderId(savedOrderId);
    }
  }, [nameStorageKey, phoneStorageKey, orderIdStorageKey]);

  // Fetch Public Menu
  const { data, error } = useQuery({
    queryKey: ["public-menu", qrToken],
    queryFn: () => api.get<PublicMenuResponse>(`/public/menu/${qrToken}`),
    retry: 1,
  });

  // Mark session verified as soon as menu data or error arrives.
  // If we have a stale activeOrderId in session, we also wait for the first
  // status response so we can decide whether to restore or clear the session
  // before showing any screen (prevents flicker between welcome and tracking).

  // Live order status & service requests.
  // For takeaway, pass orderId so we can track the specific order.
  // For dine-in, the backend always returns the active OPEN/BILLED order by table — no orderId needed.
  const statusUrl = isTakeaway && activeOrderId
    ? `/public/menu/${qrToken}/status?orderId=${activeOrderId}`
    : `/public/menu/${qrToken}/status`;

  const { data: status } = useQuery({
    queryKey: ["public-status", qrToken, isTakeaway ? activeOrderId : null],
    queryFn: () => api.get<PublicStatus>(statusUrl),
    // Every seated phone polls this. 4 s while there is an order to follow,
    // 10 s otherwise: still prompt for the guest, without a request every
    // 1.5 s per table loading the server the staff screens depend on.
    refetchInterval: (q) => (q.state.data?.order ? 4000 : 10000),
    enabled: !!data && !data.outOfService,
    gcTime: 0,
    staleTime: 0,
  });

  // Points earned on the guest's own bill, once it has been paid.
  const { data: paidSummary } = usePaidSummary(
    qrToken,
    activeOrderId,
    !!justPaidSnapshot,
  );

  // Mark session verified once we have enough info to decide what screen to show.
  // If there's a stale activeOrderId in sessionStorage, wait for the first status
  // response before revealing any UI — this prevents the flicker between welcome/
  // tracking screens that happens when we restore session and then immediately clear it.
  useEffect(() => {
    if (!data && !error) return;
    const savedOrderId = sessionStorage.getItem(orderIdStorageKey);
    if (savedOrderId && status === undefined) {
      // Status hasn't arrived yet — keep showing spinner
      return;
    }
    setSessionVerified(true);
  }, [data, error, status, orderIdStorageKey]);

  const paidOrder =
    status?.order &&
    (status.order.status === "PAID" ||
      (status.order as any).orderStatus === "PAID")
      ? status.order
      : null;
  const activeOrder =
    status?.order &&
    status.order.status !== "CANCELLED" &&
    status.order.status !== "COMPLETED" &&
    status.order.status !== "PAID" &&
    (status.order as any).orderStatus !== "PAID"
      ? status.order
      : null;

  // Track whether we had an actively tracked order from the server or placed an order in this session
  const hadActiveOrderRef = useRef(false);
  const lastActiveOrderRef = useRef<any>(null);

  // Keep track of when we actively see an order from the server
  useEffect(() => {
    if (activeOrder) {
      hadActiveOrderRef.current = true;
      lastActiveOrderRef.current = activeOrder;
    }
  }, [activeOrder]);

  // Auto-switch to tracking view ONLY when a live cooking/served order exists
  useEffect(() => {
    if (activeOrder && cart.length === 0) {
      setViewMode("TRACKING");
    }
  }, [activeOrder?.orderNumber]);

  // Immediately close games modal when order is marked paid or settled
  useEffect(() => {
    if (!activeOrder || activeOrder.status === "PAID" || (activeOrder as any).paymentStatus === "PAID" || paidOrder || justPaidSnapshot) {
      setShowGamesModal(false);
    }
  }, [activeOrder, paidOrder, justPaidSnapshot]);

  // Detect when cashier marks order as paid:
  // Backend stops returning the order (status.order becomes null).
  // If the guest was in TRACKING mode and actively had an order (hadActiveOrderRef.current is true),
  // capture it as justPaidSnapshot so the Thank You screen can render cleanly.
  // If the guest is scanning fresh or table is cleared (hadActiveOrderRef.current is false),
  // clear any stale session so new customer starts clean without flicker.
  useEffect(() => {
    if (!sessionVerified) return;
    if (status === undefined) return;

    if (status.order === null) {
      if (hadActiveOrderRef.current && viewMode === "TRACKING" && cart.length === 0 && !justPaidSnapshot) {
        // Active order was settled by cashier
        hadActiveOrderRef.current = false;
        setJustPaidSnapshot({
          orderNumber: lastActiveOrderRef.current?.orderNumber || activeOrderId || "",
          totalAmount: lastActiveOrderRef.current?.totalAmount,
          items: lastActiveOrderRef.current?.items || [],
        });
      } else if (!hadActiveOrderRef.current) {
        // Fresh scan or table cleared: clear stale sessionStorage so new customer gets fresh start
        if (activeOrderId || guestName) {
          sessionStorage.removeItem(nameStorageKey);
          sessionStorage.removeItem(phoneStorageKey);
          sessionStorage.removeItem(orderIdStorageKey);
          setActiveOrderId(null);
          setGuestName("");
          setGuestPhone("");
          setNameDraft("");
          setPhoneDraft("");
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.order, sessionVerified, viewMode, activeOrderId]);

  // Check if waiter and bill requests are active
  const hasWaiterRequest = status?.openRequests?.includes("WAITER");
  const hasBillRequest = status?.openRequests?.includes("BILL");

  // Gating rule: "request bill option enable only when the order served till then call waiter if needed"
  const isOrderServed = Boolean(activeOrder && (activeOrder.status === "SERVED" || activeOrder.status === "READY"));

  // Call Waiter / Request Bill Mutation
  const requestService = useMutation({
    mutationFn: (type: "WAITER" | "BILL") => api.post(`/public/menu/${qrToken}/request`, { type }),
    onSuccess: (_, type) => {
      queryClient.invalidateQueries({ queryKey: ["public-status", qrToken] });
      if (type === "WAITER") {
        setShowWaiterModal(false);
        toast.success("Waiter called! Floor staff will attend shortly.");
      } else {
        setShowBillModal(false);
        toast.success("Bill requested! Cashier has been notified.");
      }
    },
    onError: () => toast.error("Could not send request. Please call floor staff."),
  });

  // Pending submission: the exact order + its request id are kept for this
  // table in this tab (sessionStorage) BEFORE sending, so a timeout, lost
  // connection or refresh resends the SAME order, which the server returns
  // once instead of creating a second one. Expires after 15 minutes (the
  // guest may have left, the table may be closed).
  const pendingKey = `qr-pending-order:${qrToken}`;
  type PendingOrder = { requestId: string; payload: Record<string, unknown>; at: number };
  const readPending = (): PendingOrder | null => {
    try {
      const p = JSON.parse(sessionStorage.getItem(pendingKey) ?? "null") as PendingOrder | null;
      return p && typeof p.requestId === "string" && Date.now() - p.at < 15 * 60_000 ? p : null;
    } catch {
      return null;
    }
  };
  const clearPending = () => {
    try {
      sessionStorage.removeItem(pendingKey);
    } catch {
      /* ignore */
    }
  };
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);

  // Place Order Mutation
  const placeOrder = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post<{ orderNumber: string }>(`/public/menu/${qrToken}/order`, payload),
    onSuccess: (res: any) => {
      clearPending();
      setPendingOrder(null);
      setCurrentRequestId("req_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9));
      vibrateSuccess();
      playSuccessChime();
      const orderNum = res?.orderNumber || "Pending";
      const allMods = (data?.categories || [])
        .flatMap((cat) => cat.items)
        .flatMap((it) => it.modifierGroups || [])
        .flatMap((g) => g.modifierGroup.modifiers);

      const newActiveOrder = {
        id: res?.id || activeOrderId || "",
        orderNumber: orderNum,
        status: "OPEN",
        acceptance: "PENDING",
        placedAt: new Date().toISOString(),
        items: cart.map((c) => ({
          id: c.id,
          nameSnapshot: c.name,
          quantity: c.quantity,
          unitPriceSnapshot: String(c.unitPrice),
          lineTotal: String(c.unitPrice * c.quantity),
          status: "PENDING",
          kitchenNote: c.cookingNote || undefined,
          modifiers: (c.modifierIds || []).map((id) => {
            const found = allMods.find((m) => m.id === id);
            return {
              id,
              nameSnapshot: found?.name || "Extra",
              priceAdjSnapshot: found?.priceAdjustment || "0",
            };
          }),
        })),
        totalAmount: cartTotalPrice.toFixed(0),
      };

      hadActiveOrderRef.current = true;
      lastActiveOrderRef.current = newActiveOrder;

      if (res?.id) {
        setActiveOrderId(res.id);
        sessionStorage.setItem(orderIdStorageKey, res.id);
      }

      // Optimistically update status query so tracking view renders smoothly with NO null gap
      queryClient.setQueryData(
        ["public-status", qrToken, isTakeaway ? res?.id : null],
        {
          order: newActiveOrder,
          openRequests: [],
        }
      );

      setCart([]);
      try {
        localStorage.removeItem("easy-dine-cart-" + qrToken);
        sessionStorage.removeItem("easy-dine-cart-" + qrToken);
      } catch {}
      setShowConfirmOrderModal(false);
      setShowCartDrawer(false);
      setViewMode("TRACKING");
      queryClient.invalidateQueries({ queryKey: ["public-status", qrToken] });
      toast.success(`Order #${orderNum} placed! Waiting for cashier approval.`);
    },
    onError: (err) => {
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 0 || status === 408 || status === 429 || status >= 500) {
        // Maybe it arrived, maybe not: keep it and resend the same order.
        setPendingOrder(readPending());
        setShowConfirmOrderModal(false);
        toast.warning("No confirmation yet. We'll keep sending your order. It will not be placed twice.");
        return;
      }
      clearPending();
      setPendingOrder(null);
      toast.error(err instanceof ApiError ? err.message : "Could not place order. Please try again.");
    },
  });

  const submitOrder = (customName?: string, customPhone?: string) => {
    const finalName = (customName || guestName || nameDraft).trim();
    if (!finalName) {
      toast.error("Please enter your name");
      return;
    }
    const cleanPhone = (customPhone || guestPhone || phoneDraft).replace(/\D/g, "").slice(0, 10);
    if (cleanPhone.length !== 10) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }
    const payload = {
      requestId: currentRequestId,
      guestName: finalName,
      guestPhone: cleanPhone,
      notes: cart.map((c) => c.cookingNote).filter(Boolean).join("; ") || undefined,
      items: cart.map((c) => ({
        menuItemId: c.menuItemId,
        quantity: c.quantity,
        modifierIds: c.modifierIds ?? [],
        kitchenNote: c.cookingNote || undefined,
      })),
    };
    try {
      sessionStorage.setItem(pendingKey, JSON.stringify({ requestId: currentRequestId, payload, at: Date.now() }));
    } catch {
      /* storage blocked: still send, just not refresh-proof */
    }
    placeOrder.mutate(payload);
  };

  // A pending order (refresh, reconnect): resend it with its own id.
  useEffect(() => {
    const p = readPending();
    if (!p) {
      clearPending();
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingOrder(p);
    const resend = () => {
      const cur = readPending();
      if (cur && !placeOrder.isPending) placeOrder.mutate(cur.payload);
    };
    resend();
    window.addEventListener("online", resend);
    const t = setInterval(resend, 15_000);
    return () => {
      window.removeEventListener("online", resend);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrToken]);

  // Check-in action with Name & Contact
  const confirmCheckIn = () => {
    const finalName = nameDraft.trim() || "Guest";
    const cleanPhone = phoneDraft.replace(/\D/g, "").slice(0, 10);
    if (!cleanPhone || cleanPhone.length !== 10) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }
    setGuestName(finalName);
    setGuestPhone(cleanPhone);
    sessionStorage.setItem(nameStorageKey, finalName);
    sessionStorage.setItem(phoneStorageKey, cleanPhone);
    api.post(`/public/menu/${qrToken}/check-in`, { guestName: finalName, phone: cleanPhone }).catch(() => {});
  };

  // Cart calculations
  const cartTotalDishes = useMemo(() => cart.reduce((acc, c) => acc + c.quantity, 0), [cart]);
  const cartTotalPrice = useMemo(
    () => cart.reduce((acc, c) => acc + c.unitPrice * c.quantity, 0),
    [cart]
  );

  const getItemQuantityInCart = (itemId: string) => {
    return cart.filter((c) => c.menuItemId === itemId).reduce((acc, c) => acc + c.quantity, 0);
  };

  const updateCartQuantity = (cartLineId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((line) => {
          if (line.id === cartLineId) {
            const newQty = line.quantity + delta;
            return newQty > 0 ? { ...line, quantity: newQty } : null;
          }
          return line;
        })
        .filter(Boolean) as CartLine[]
    );
  };

  // Same dish, different preference: one portion of a line becomes its own
  // line (e.g. 2× Paneer Mutter -> 1× "spicy" + 1× "buttery").
  const splitCartLine = (cartLineId: string) => {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.id === cartLineId);
      if (idx === -1 || prev[idx].quantity < 2) return prev;
      const line = prev[idx];
      const next = [...prev];
      next[idx] = { ...line, quantity: line.quantity - 1 };
      next.splice(idx + 1, 0, { ...line, id: `${line.id}-pref-${Date.now()}`, quantity: 1, cookingNote: "" });
      return next;
    });
  };

  const setCartLineNote = (cartLineId: string, note: string) => {
    setCart((prev) => prev.map((l) => (l.id === cartLineId ? { ...l, cookingNote: note.slice(0, 120) } : l)));
  };

  const addSimpleItem = (item: PublicMenuItem, catName: string) => {
    const lineId = `line-${item.id}-default`;
    const price = parseFloat(item.price);
    setCart((prev) => {
      const existing = prev.find((c) => c.id === lineId);
      if (existing) {
        return prev.map((c) => (c.id === lineId ? { ...c, quantity: c.quantity + 1 } : c));
      }
      return [
        ...prev,
        {
          id: lineId,
          menuItemId: item.id,
          name: item.name,
          imageUrl: getDishImage(item, catName),
          isVeg: item.isVeg,
          modifierIds: [],
          modifierLabel: "",
          unitPrice: price,
          quantity: 1,
          cookingNote: "",
        },
      ];
    });
    toast.success(`Added ${item.name}`);
  };

  const removeSimpleItem = (itemId: string) => {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.menuItemId === itemId);
      if (idx === -1) return prev;
      if (prev[idx].quantity > 1) {
        return prev.map((c, i) => (i === idx ? { ...c, quantity: c.quantity - 1 } : c));
      }
      return prev.filter((_, i) => i !== idx);
    });
  };

  // ---- Voice ordering: menu for the parser, and adding reviewed lines -------
  const menuIndex = useMemo(() => {
    const m = new Map<string, { item: PublicMenuItem; categoryName: string }>();
    for (const cat of data?.categories ?? []) for (const item of cat.items) m.set(item.id, { item, categoryName: cat.name });
    return m;
  }, [data]);

  const voiceMenu = useMemo<VoiceMenuItem[]>(
    () =>
      [...menuIndex.values()].map(({ item }) => ({
        id: item.id,
        // A required option, or options picked by default, must be chosen on screen.
        needsChoice: (item.modifierGroups || []).some(
          (g) => g.modifierGroup.isRequired || g.modifierGroup.minSelect > 0 || g.modifierGroup.modifiers.some((m) => m.isDefault),
        ),
      })),
    [menuIndex],
  );

  const openItemOptions = (item: PublicMenuItem, categoryName: string) => {
    const defaultMods = (item.modifierGroups || [])
      .flatMap((g) => g.modifierGroup.modifiers)
      .filter((m) => m.isDefault)
      .map((m) => m.id);
    setCustomizingItem({ item, categoryName });
    setCustomizingQty(1);
    setCookingNote("");
    setSelectedModifierIds(defaultMods);
  };

  // Reviewed voice lines join the normal cart (still editable; the order is
  // placed only through the Confirm Order modal). Prices come from the menu.
  const addVoiceLines = (lines: VoiceAddLine[]) => {
    setCart((prev) => {
      let next = [...prev];
      lines.forEach((l, i) => {
        const hit = menuIndex.get(l.itemId);
        if (!hit || l.quantity < 1) return;
        const { item, categoryName } = hit;
        const defaultId = `line-${item.id}-default`;
        const existing = !l.note && next.find((c) => c.id === defaultId);
        if (existing) {
          next = next.map((c) => (c.id === defaultId ? { ...c, quantity: c.quantity + l.quantity } : c));
          return;
        }
        next.push({
          id: l.note ? `line-${item.id}-voice-${Date.now()}-${i}` : defaultId,
          menuItemId: item.id,
          name: item.name,
          imageUrl: getDishImage(item, categoryName),
          isVeg: item.isVeg,
          modifierIds: [],
          modifierLabel: "",
          unitPrice: parseFloat(item.price),
          quantity: l.quantity,
          cookingNote: l.note.slice(0, 120),
        });
      });
      return next;
    });
  };

  // Cooking-note mic (speech to text into the note box), in the app's language.
  const triggerAudioVoiceInput = () => {
    const appendNote = (heard: string) => setCookingNote((prev) => (prev ? `${prev}, ${heard}` : heard));
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      const heard = window.prompt("Speak or type your request:");
      if (heard) appendNote(heard);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = RECOGNITION_LANG[locale];
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      setIsListeningCustomMic(true);
      toast.info("🎙️ Listening... Speak now!");

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        appendNote(transcript);
        toast.success(`Added note: "${transcript}"`);
        setIsListeningCustomMic(false);
      };
      recognition.onerror = () => {
        setIsListeningCustomMic(false);
        toast.info("Voice input ended. You can also type directly.");
      };
      recognition.onend = () => setIsListeningCustomMic(false);
      recognition.start();
    } catch {
      setIsListeningCustomMic(false);
      const heard = window.prompt("Speak or type your request:");
      if (heard) appendNote(heard);
    }
  };

  // Filtered categories
  const filteredCategories = useMemo(() => {
    if (!data?.categories) return [];
    return data.categories
      .map((cat) => {
        const matchingItems = cat.items.filter((item) => {
          if (dietFilter === "VEG" && !item.isVeg) return false;
          if (dietFilter === "SPICY" && !item.name.toLowerCase().includes("tikka") && !item.name.toLowerCase().includes("masala")) return false;
          if (dietFilter === "BREADS" && !cat.name.toLowerCase().includes("bread") && !item.name.toLowerCase().includes("roti")) return false;
          if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            return item.name.toLowerCase().includes(q) || (item.description ?? "").toLowerCase().includes(q);
          }
          return true;
        });
        return { ...cat, items: matchingItems };
      })
      .filter((cat) => cat.items.length > 0);
  }, [data?.categories, dietFilter, searchQuery]);

  // ---- Menu screen presentation: search toggle, photo carousel, category tabs ----
  const [showSearch, setShowSearch] = useState(false);
  const [activeCatId, setActiveCatId] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [tabsBar, setTabsBar] = useState({ width: 100, left: 0 });

  // Up to five distinct dish photos for the top carousel (real uploads first).
  const heroPhotos = useMemo(() => {
    const items = (data?.categories ?? []).flatMap((c) => c.items.map((item) => ({ item, cat: c.name })));
    const uploaded = items.filter(({ item }) => item.imageUrl && item.imageUrl.trim() && !item.imageUrl.includes("null"));
    const source = uploaded.length >= 2 ? uploaded : items;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const { item, cat } of source) {
      const src = getDishImage(item, cat);
      if (!seen.has(src)) {
        seen.add(src);
        out.push(src);
      }
      if (out.length >= 5) break;
    }
    return out;
  }, [data?.categories]);

  // Auto-advance the carousel every 4 s.
  useEffect(() => {
    if (heroPhotos.length < 2 || viewMode !== "MENU") return;
    const t = setInterval(() => setSlide((s) => (s + 1) % heroPhotos.length), 4000);
    return () => clearInterval(t);
  }, [heroPhotos.length, viewMode]);

  // Thin progress bar under the category tabs: how much of the strip is in view.
  const updateTabsBar = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    const { scrollWidth, clientWidth, scrollLeft } = el;
    if (scrollWidth <= clientWidth + 1) {
      setTabsBar({ width: 100, left: 0 });
      return;
    }
    setTabsBar({ width: (clientWidth / scrollWidth) * 100, left: (scrollLeft / scrollWidth) * 100 });
  }, []);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => updateTabsBar());
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [updateTabsBar, viewMode, sessionVerified]);

  // Scroll spy: the tab for the section under the sticky bar is active.
  useEffect(() => {
    if (viewMode !== "MENU") return;
    const ids = filteredCategories.map((c) => c.id);
    const onScroll = () => {
      let current: string | null = null;
      for (const id of ids) {
        const el = document.getElementById(`cat-${id}`);
        if (el && el.getBoundingClientRect().top <= 180) current = id;
      }
      setActiveCatId(current);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [filteredCategories, viewMode]);

  // Keep the active tab centred in the strip.
  useEffect(() => {
    const strip = tabsRef.current;
    if (!strip || !activeCatId) return;
    const tab = strip.querySelector<HTMLElement>(`[data-cat="${activeCatId}"]`);
    if (!tab) return;
    strip.scrollTo({ left: tab.offsetLeft - strip.clientWidth / 2 + tab.clientWidth / 2, behavior: "smooth" });
  }, [activeCatId]);

  const scrollToCategory = (id: string) => {
    document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Loading or Error screen
  if (error) {
    // 404 = this QR code does not match any table (wrong, replaced or rotated
    // code), which retrying cannot fix; anything else is a connection problem.
    const invalidCode = error instanceof ApiError && error.status === 404;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
        <UtensilsCrossed className="h-12 w-12 text-primary" />
        <h2 className="text-xl font-bold">{invalidCode ? "This QR code is not valid" : "Could not load the menu"}</h2>
        <p className="max-w-xs text-sm text-muted-foreground">
          {invalidCode
            ? "It may be old or replaced. Please ask the staff for the current QR card at your table."
            : "Check your internet connection and try again."}
        </p>
        {!invalidCode && <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-xl bg-primary px-6 py-2.5 text-xs font-bold text-primary-foreground hover:bg-[var(--primary-hover)]"
        >
          Retry
        </button>}
      </div>
    );
  }

  // Out-of-service table: the notice only. No menu, cart or ordering.
  if (data?.outOfService) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
        <UtensilsCrossed className="h-12 w-12 text-primary" />
        <p className="max-w-xs text-base font-semibold" data-testid="table-out-of-service">
          {data.message || "This table is out of service. Please move to another table. Thank you."}
        </p>
        <PoweredByEasyDine tone="light" className="absolute bottom-6 left-0 right-0" />
      </div>
    );
  }

  // Session-verification gate: show a neutral loading screen until the first
  // status response arrives and we know whether to restore or wipe the session.
  // This prevents ANY flicker between screens on QR scan.
  if (!sessionVerified) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-border border-t-primary" />
        <p className="text-sm text-muted-foreground font-sans">Loading menu…</p>
      </div>
    );
  }

  // 1b. PAID / THANK YOU SCREEN
  const handleStartNewOrder = () => {
    hadActiveOrderRef.current = false;
    lastActiveOrderRef.current = null;
    sessionStorage.removeItem(nameStorageKey);
    sessionStorage.removeItem(phoneStorageKey);
    sessionStorage.removeItem(orderIdStorageKey);
    setActiveOrderId(null);
    setJustPaidSnapshot(null);
    setGuestName("");
    setGuestPhone("");
    setNameDraft("");
    setPhoneDraft("");
    setCart([]);
    setViewMode("MENU");
    queryClient.removeQueries({ queryKey: ["public-status", qrToken] });
  };

  // Show Thank You screen when:
  // 1. Guest was in TRACKING mode and backend order disappeared (justPaidSnapshot set), OR
  // 2. Backend explicitly returns a PAID order (paidOrder non-null, legacy path)
  const showThankYou = (justPaidSnapshot || (paidOrder && viewMode === "TRACKING")) && !cart.length;

  if (showThankYou) {
    const orderNum = justPaidSnapshot?.orderNumber || paidOrder?.orderNumber || "";
    const totalAmt = justPaidSnapshot?.totalAmount ?? paidOrder?.totalAmount;
    const orderItems = justPaidSnapshot?.items?.length
      ? justPaidSnapshot.items
      : paidOrder?.items ?? [];
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground font-sans">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="h-10 w-10" />
        </div>
        <h2 className="text-2xl font-black text-foreground">{guestName ? `Thank you, ${guestName}!` : "Thank you!"}</h2>
        <p className="text-sm text-muted-foreground">
          {orderNum ? `Order #${orderNum} · ` : ""}Bill settled ✓
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          We hope you enjoyed your meal. See you again soon!
        </p>
        {(orderItems.length > 0 || totalAmt) && (
          <div className="mt-4 rounded-2xl border border-border bg-card p-4 text-left w-full max-w-xs">
            {orderItems.length > 0 && (
              <>
                <p className="text-xs font-bold text-muted-foreground mb-2">Your order</p>
                {orderItems.slice(0, 5).map((it: any, i: number) => (
                  <div key={i} className="py-1.5 border-b border-border">
                    <div className="flex justify-between text-xs">
                      <span className="text-foreground/85 font-medium">{it.nameSnapshot} × {it.quantity}</span>
                      <span className="text-foreground font-bold">₹{it.lineTotal || (parseFloat(it.unitPriceSnapshot || "0") * it.quantity).toFixed(0)}</span>
                    </div>
                    {it.kitchenNote && (
                      <p className="mt-0.5 text-[10px] text-primary font-medium">{it.kitchenNote}</p>
                    )}
                  </div>
                ))}
                {orderItems.length > 5 && <p className="text-xs text-muted-foreground mt-1">...and {orderItems.length - 5} more items</p>}
              </>
            )}
            {totalAmt && (
              <div className="flex justify-between font-bold text-sm mt-2 pt-2 border-t border-border">
                <span>Total paid</span>
                <span className="text-emerald-400">₹{totalAmt}</span>
              </div>
            )}
          </div>
        )}

        <PaidPointsCard paid={paidSummary} />
        <ReviewButton url={data?.reviewUrl} className="mt-2 w-full max-w-xs" />

        <button
          type="button"
          onClick={handleStartNewOrder}
          className="mt-5 flex h-12 w-full max-w-xs items-center justify-center rounded-2xl bg-primary text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:brightness-105 active:scale-[0.98]"
        >
          Start New Order · Browse Menu
        </button>
      </div>
    );
  }

  // 1. Welcome screen phone gate removed (menu-first browsing)
  // 2. LIVE ORDER TRACKING SCREEN (Images 1 & 2: Order #24 with Stepper, Bill so far, and Action buttons)
  if (viewMode === "TRACKING" && activeOrder) {
    const isServed = activeOrder.status === "SERVED" || activeOrder.status === "READY" || (activeOrder as any).cookingStatus === "SERVED" || (activeOrder as any).cookingStatus === "READY";
    const isPreparing = activeOrder.status === "PREPARING" || (activeOrder as any).cookingStatus === "PREPARING" || isServed;
    const isAccepted = activeOrder.acceptance === "ACCEPTED" || isPreparing || isServed;

    // Itemized list for "Bill so far"
    const orderItems = activeOrder.items || [];
    const totalAmount = activeOrder.totalAmount || "780";

    return (
      <div className="relative mx-auto min-h-screen w-full max-w-[520px] bg-background pb-32 font-sans text-foreground px-5 pt-7">
        {/* Games Arcade Banner for Active Order */}
        {activeOrder && activeOrder.paymentStatus !== "PAID" && (
          <div className="mb-4 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 p-3.5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white shadow-sm text-base">
                  🎮
                </div>
                <div>
                  <h4 className="text-xs font-black text-foreground">Play Table Games</h4>
                  <p className="text-[10px] text-muted-foreground">Food Memory (4×6) & Catch the Snacks</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGamesModal(true)}
                className="rounded-xl bg-primary px-3 py-1.5 text-xs font-black text-primary-foreground shadow-sm hover:brightness-105 active:scale-95 transition-all"
              >
                Play Now
              </button>
            </div>
          </div>
        )}

        {/* Top Header (Image 1 match) */}
        <div>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              Order {formatOrderNumber(activeOrder.orderNumber || "24")}
            </h1>
            <button
              onClick={() => setViewMode("MENU")}
              className="text-xs font-bold text-primary hover:underline"
            >
              View Menu
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {data?.tableName || "Table"} · {guestName} · placed {formatDeviceTime(activeOrder.placedAt) || formatDeviceTime(new Date().toISOString())}
          </p>
          {data?.loyalty?.enabled && (
            <div className="mt-2">
              <PointsChip qrToken={qrToken} phone={guestPhone} loyalty={data.loyalty} />
            </div>
          )}
          <ReviewButton url={data?.reviewUrl} className="mt-3 w-full" />
        </div>

        {/* Card 1: Vertical Progress Stepper (Images 1 & 2 match) */}
        <div className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-lg">
          <div className="flex flex-col gap-6 relative">
            {/* Step 1: Accepted by cashier */}
            <div className="flex items-start gap-4 relative">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold transition-all z-10",
                  isAccepted
                    ? "bg-primary text-primary-foreground"
                    : "border-2 border-border bg-card text-muted-foreground"
                )}
              >
                {isAccepted ? <Check className="h-4 w-4 stroke-[3]" /> : "1"}
              </div>

              {/* Connecting vertical line */}
              <div
                className={cn(
                  "absolute left-4 top-8 w-0.5 h-14 -translate-x-1/2",
                  isAccepted ? "bg-primary" : "bg-secondary"
                )}
              />

              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">Accepted by cashier</span>
                  {activeOrder.acceptedAt && (
                    <span className="text-[11px] text-muted-foreground">{formatDeviceTime(activeOrder.acceptedAt)}</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {isAccepted ? "Sent to kitchen · KOT printed" : "Waiting for cashier confirmation"}
                </span>
              </div>
            </div>

            {/* Step 2: Preparing in kitchen */}
            <div className="flex items-start gap-4 relative">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold transition-all z-10",
                  isServed
                    ? "bg-primary text-primary-foreground"
                    : isPreparing
                    ? "border-2 border-primary bg-accent text-primary"
                    : "border-2 border-border bg-card text-muted-foreground/80"
                )}
              >
                {isServed ? (
                  <Check className="h-4 w-4 stroke-[3]" />
                ) : isPreparing ? (
                  <Clock className="h-4 w-4 text-primary animate-spin" />
                ) : (
                  "2"
                )}
              </div>

              {/* Connecting vertical line */}
              <div
                className={cn(
                  "absolute left-4 top-8 w-0.5 h-14 -translate-x-1/2",
                  isServed ? "bg-primary" : "bg-secondary"
                )}
              />

              <div className="flex flex-col flex-1">
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-sm font-bold",
                      isPreparing ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    Preparing in kitchen
                  </span>
                  {!isServed && isPreparing && (
                    <span className="rounded-full bg-card px-2.5 py-0.5 text-[10px] font-bold text-primary border border-border">
                      ~15 min
                    </span>
                  )}
                  {activeOrder.preparedAt && (
                    <span className="text-[11px] text-muted-foreground">{formatDeviceTime(activeOrder.preparedAt)}</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {isServed ? "Prepared by chef" : isPreparing ? "Your dishes are on the stove" : "Pending kitchen start"}
                </span>
              </div>
            </div>

            {/* Step 3: Served at your table */}
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold transition-all z-10",
                  isServed
                    ? "bg-primary text-primary-foreground"
                    : "border-2 border-border bg-card text-muted-foreground/80"
                )}
              >
                {isServed ? <Check className="h-4 w-4 stroke-[3]" /> : "○"}
              </div>

              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className={cn("text-sm font-bold", isServed ? "text-foreground" : "text-muted-foreground")}>
                    {isTakeaway ? "Ready for pickup at counter" : "Served at your table"}
                  </span>
                  {activeOrder.servedAt && (
                    <span className="text-[11px] text-muted-foreground">{formatDeviceTime(activeOrder.servedAt)}</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {isServed
                    ? isTakeaway
                      ? "Your order is packed and ready for pickup!"
                      : "Enjoy your meal!"
                    : isTakeaway
                    ? "Packing soon"
                    : "Ready soon"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Service Request Banner if active (Image 2 match) */}
        {hasWaiterRequest && (
          <div className="mt-3 flex items-center justify-between rounded-2xl border border-primary/40 bg-accent p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Phone className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Waiter request sent</p>
                <p className="text-xs text-muted-foreground">Waiting for staff acknowledgement</p>
              </div>
            </div>
          </div>
        )}

        {hasBillRequest && (
          <div className="mt-3 flex items-center justify-between rounded-2xl border border-primary/40 bg-accent p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Receipt className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Bill request sent</p>
                <p className="text-xs text-muted-foreground">Cashier notified · waiting for acknowledgement</p>
              </div>
            </div>
          </div>
        )}

        {/* Card 2: Bill so far (Image 1 match) */}
        <div className="mt-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <span className="text-sm font-bold text-foreground">Bill so far</span>
            <span className="text-[11px] font-bold text-muted-foreground tracking-wider">LIVE</span>
          </div>

          <div className="mt-3 divide-y divide-border">
            {orderItems.map((item, idx) => (
              <div key={item.id || idx} className="py-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground/85 font-medium">
                    {item.nameSnapshot} <span className="text-muted-foreground">× {item.quantity}</span>
                  </span>
                  <span className="text-foreground font-bold">
                    ₹{item.lineTotal || (parseFloat(item.unitPriceSnapshot || "150") * item.quantity).toFixed(0)}
                  </span>
                </div>
                {item.modifiers && item.modifiers.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1.5">
                    {item.modifiers.map((m: any) => {
                      const adj = Number(m.priceAdjSnapshot || 0);
                      return (
                        <span key={m.id} className="text-xs text-primary font-medium">
                          + {m.nameSnapshot} {adj > 0 ? `(+₹${adj})` : ""}
                        </span>
                      );
                    })}
                  </div>
                )}
                {item.kitchenNote && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Note: &ldquo;{item.kitchenNote}&rdquo;
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            <span className="text-base font-black text-foreground">Total</span>
            <span className="text-xl font-black text-foreground">₹{totalAmount}</span>
          </div>
        </div>

        {/* Center link: + Add more items (Image 1 match) */}
        <div className="mt-6 text-center">
          <button
            onClick={() => setViewMode("MENU")}
            className="text-sm font-extrabold text-primary hover:underline"
          >
            + Add more items
          </button>
        </div>

        {/* Sticky Bottom Bar (Images 1 & 2 match) */}
        <div className="fixed bottom-0 inset-x-0 z-40 p-4 bg-gradient-to-t from-background via-background/90 to-transparent">
          <div className="flex items-center gap-3">
            {/* Call waiter button */}
            <button
              onClick={() => setShowWaiterModal(true)}
              className={cn(
                "flex-1 flex h-12 items-center justify-center gap-2 rounded-2xl border text-sm font-bold transition-all",
                hasWaiterRequest
                  ? "border-border bg-card text-foreground/85"
                  : "border-border bg-card text-foreground hover:bg-secondary"
              )}
            >
              <Phone className="h-4 w-4 text-primary" />
              {hasWaiterRequest ? "Call waiter again" : "Call waiter"}
            </button>

            {/* Request bill button (Enabled only when order is served, per user instruction) */}
            {hasBillRequest ? (
              <button
                disabled
                className="flex-1 flex h-12 items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-accent text-sm font-bold text-primary"
              >
                <Check className="h-4 w-4" />
                Bill requested
              </button>
            ) : (
              <button
                disabled={!isOrderServed}
                onClick={() => {
                  if (!isOrderServed) {
                    toast.info("Request bill will be active once food is served at your table.");
                    return;
                  }
                  setShowBillModal(true);
                }}
                className={cn(
                  "flex-1 flex h-12 items-center justify-center gap-2 rounded-2xl text-sm font-bold transition-all shadow-md",
                  isOrderServed
                    ? "bg-primary text-primary-foreground hover:bg-[var(--primary-hover)]"
                    : "border border-border bg-card text-muted-foreground cursor-not-allowed opacity-60"
                )}
                title={!isOrderServed ? "Available after food is served" : "Request bill"}
              >
                <Receipt className="h-4 w-4" />
                Request bill
              </button>
            )}
          </div>
        </div>

        <PoweredByEasyDine tone="light" className="mt-6 pb-6" />

        {/* Modals for Waiter & Bill */}
        {showWaiterModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-xs rounded-2xl border border-border bg-card p-5 text-center text-foreground">
              <Phone className="mx-auto h-10 w-10 text-primary mb-2" />
              <h3 className="text-base font-bold text-foreground">Call Waiter?</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Notify floor staff to attend {data?.tableName || "Table"}
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setShowWaiterModal(false)}
                  className="flex-1 rounded-xl border border-border bg-card py-2.5 text-xs font-bold text-foreground/85"
                >
                  Cancel
                </button>
                <button
                  onClick={() => requestService.mutate("WAITER")}
                  className="flex-1 rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground hover:bg-[var(--primary-hover)]"
                >
                  Yes, call
                </button>
              </div>
            </div>
          </div>
        )}

        {showBillModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-xs rounded-2xl border border-border bg-card p-5 text-center text-foreground">
              <Receipt className="mx-auto h-10 w-10 text-primary mb-2" />
              <h3 className="text-base font-bold text-foreground">Request Bill?</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Notify the cashier to prepare and bring your final bill to {data?.tableName || "Table"}.
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setShowBillModal(false)}
                  className="flex-1 rounded-xl border border-border bg-card py-2.5 text-xs font-bold text-foreground/85"
                >
                  Cancel
                </button>
                <button
                  onClick={() => requestService.mutate("BILL")}
                  className="flex-1 rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground hover:bg-[var(--primary-hover)]"
                >
                  Yes, request
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TABLE GAMES MODAL (TRACKING VIEW) */}
        {showGamesModal && activeOrder && (
          <GamesDialog
            restaurantName={(data as any)?.restaurantName || data?.branchName || "EasyDine"}
            restaurantLogoUrl={(data as any)?.restaurantLogoUrl || (data as any)?.logoUrl}
            onClose={handleCloseGames}
            isOrderPaid={!activeOrder || activeOrder.status === "PAID" || (activeOrder as any).paymentStatus === "PAID"}
            settings={getStoredGameSettings((data as any)?.branchId || null)}
          />
        )}
      </div>
    );
  }

  // 3. MAIN MENU SCREEN: narrow editorial column, photo carousel, pill tabs, black dish cards.
  const LANG_SHORT: Record<string, string> = { en: "EN", hi: "हि", mr: "मर" };
  const currentCatId = activeCatId ?? filteredCategories[0]?.id ?? null;
  const slideIndex = heroPhotos.length ? slide % heroPhotos.length : 0;
  return (
    <div className="relative mx-auto min-h-screen w-full max-w-[520px] bg-background pb-36 font-sans text-foreground">
      {/* C8: Offline banner */}
      {isOffline && (
        <div className="fixed top-0 inset-x-0 z-50 bg-red-600 px-4 py-2 text-center text-xs font-bold text-white">
          ⚠ You are offline — ordering is paused. Check your Wi-Fi.
        </div>
      )}
      {pendingOrder && (
        <div className="fixed inset-x-0 top-0 z-40 bg-primary px-4 py-2 text-center text-xs font-bold text-primary-foreground" role="status">
          Sending your order… It will not be placed twice. Please keep this page open.
        </div>
      )}

      {/* Header: restaurant, search, categories menu, language pill */}
      <header className="px-5 pt-7 pb-2">
        <div className="ed-enter flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-heading text-[26px] leading-tight font-normal tracking-[-0.02em] text-foreground">
              {(data as any)?.restaurantName || data?.branchName || "EasyDine"}
            </h1>
            <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="rounded-full bg-lime px-2.5 py-0.5 font-medium text-lime-foreground">
                {isTakeaway ? "Takeaway" : (data?.tableName || "Table")}
              </span>
              {guestName && <span>· {guestName}</span>}
            </div>
            {data?.loyalty?.enabled && (
              <div className="mt-2">
                <PointsChip qrToken={qrToken} phone={guestPhone} loyalty={data.loyalty} />
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="flex items-center">
              <button
                type="button"
                aria-label="Search dishes"
                aria-expanded={showSearch}
                onClick={() => setShowSearch((v) => !v)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors duration-200 hover:bg-black/5"
              >
                <Search className="h-[22px] w-[22px]" strokeWidth={2} />
              </button>
              <button
                type="button"
                aria-label="All categories"
                onClick={() => setShowCategorySheet(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors duration-200 hover:bg-black/5"
              >
                <MenuIcon className="h-6 w-6" strokeWidth={1.75} />
              </button>
            </div>
            <div role="group" aria-label="Language" className="flex rounded-full border border-foreground p-0.5 text-[12px]">
              {LOCALES.map((l) => (
                <button
                  key={l}
                  type="button"
                  lang={l}
                  aria-pressed={locale === l}
                  onClick={() => setLocale(l)}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 transition-colors duration-200",
                    locale === l ? "bg-foreground text-background" : "text-foreground hover:bg-black/5"
                  )}
                >
                  {LANG_SHORT[l] ?? l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {(showSearch || searchQuery) && (
          <div className="ed-enter relative mt-4">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              autoFocus={showSearch}
              placeholder='Search "paneer"'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 w-full rounded-full border border-border bg-white pl-11 pr-10 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:border-foreground focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearchQuery("")}
                className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* Service actions */}
        <div className="ed-enter mt-4 flex flex-wrap items-center gap-2" style={{ ["--delay" as string]: "80ms" }}>
          <button
            type="button"
            onClick={() => setShowWaiterModal(true)}
            className="flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background transition-all duration-200 hover:-translate-y-px hover:bg-foreground/85"
          >
            <Phone className="h-3.5 w-3.5" />
            Call waiter
          </button>
          {activeOrder && (
            <button
              type="button"
              onClick={() => setViewMode("TRACKING")}
              className="flex items-center gap-1 rounded-full border border-foreground px-4 py-2 text-xs font-medium text-foreground transition-colors duration-200 hover:bg-foreground hover:text-background cursor-pointer"
            >
              <span>Live Order</span>
            </button>
          )}
          {activeOrder && (
            <button
              type="button"
              onClick={() => setShowGamesModal(true)}
              className="flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-700 hover:bg-amber-500/20 active:scale-95 transition-all cursor-pointer"
            >
              <span>🎮 Games</span>
            </button>
          )}
        </div>

        {/* Voice ordering: speak a whole order, review it, then add to cart */}
        <VoiceOrder
          qrToken={qrToken}
          menu={voiceMenu}
          onAdd={addVoiceLines}
          onChooseOptions={(id) => {
            const hit = menuIndex.get(id);
            if (hit) openItemOptions(hit.item, hit.categoryName);
          }}
        />
      </header>

      {/* Auto-rotating dish photo carousel */}
      {heroPhotos.length > 0 && !searchQuery && (
        <div className="ed-enter px-5 pt-3" style={{ ["--delay" as string]: "140ms" }}>
          <div
            className="relative aspect-[16/10] overflow-hidden rounded-[20px] bg-muted"
            aria-roledescription="carousel"
            aria-label="Dish photos"
          >
            <div
              className="flex h-full transition-transform duration-700 ease-[cubic-bezier(0.65,0,0.35,1)]"
              style={{ transform: `translateX(-${slideIndex * 100}%)` }}
            >
              {heroPhotos.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={src}
                  src={src}
                  alt=""
                  aria-hidden={i !== slideIndex}
                  className="h-full w-full shrink-0 object-cover"
                  onError={(e) => {
                    const fb = DISH_IMAGE_FALLBACKS.default;
                    if (e.currentTarget.src !== fb) e.currentTarget.src = fb;
                  }}
                />
              ))}
            </div>
            {heroPhotos.length > 1 && (
              <div className="absolute inset-x-0 bottom-2 flex justify-center gap-0.5">
                {heroPhotos.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    aria-label={`Photo ${i + 1}`}
                    onClick={() => setSlide(i)}
                    className="flex items-center justify-center p-1"
                  >
                    <span
                      className={cn(
                        "block h-1.5 rounded-full bg-white transition-all duration-300",
                        i === slideIndex ? "w-5 opacity-100" : "w-1.5 opacity-60"
                      )}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filter chips */}
      <div className="ed-no-scrollbar mt-4 flex items-center gap-2 overflow-x-auto px-5 text-xs">
        <button
          onClick={() => setDietFilter(dietFilter === "VEG" ? "ALL" : "VEG")}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 transition-colors duration-200",
            dietFilter === "VEG"
              ? "border-success bg-success/10 text-success"
              : "border-border bg-white text-foreground/80 hover:border-foreground/40 hover:text-foreground"
          )}
        >
          <span className="flex h-3 w-3 items-center justify-center rounded-[2px] border border-emerald-600 p-[1.5px]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
          </span>
          Veg
        </button>
        {(["POPULAR", "SPICY", "BREADS"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setDietFilter(dietFilter === f ? "ALL" : f)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 transition-colors duration-200",
              dietFilter === f
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-white text-foreground/80 hover:border-foreground/40 hover:text-foreground"
            )}
          >
            {f === "POPULAR" ? "Popular" : f === "SPICY" ? "Spicy" : "Breads"}
          </button>
        ))}
      </div>

      {/* Sticky category pill tabs + scroll-progress bar */}
      {filteredCategories.length > 0 && (
        <div className="sticky top-0 z-30 mt-3 bg-background/90 px-5 pt-3 pb-2 backdrop-blur-md">
          <div ref={tabsRef} onScroll={updateTabsBar} className="ed-no-scrollbar overflow-x-auto">
            <div className="flex w-max gap-1">
              {filteredCategories.map((cat) => {
                const active = cat.id === currentCatId;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    data-cat={cat.id}
                    aria-current={active ? "true" : undefined}
                    onClick={() => scrollToCategory(cat.id)}
                    className={cn(
                      "shrink-0 rounded-full px-4 py-2 text-[15px] transition-colors duration-200",
                      active ? "bg-[#111] text-white" : "text-foreground/80 hover:bg-black/5 hover:text-foreground"
                    )}
                  >
                    {cat.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-2 h-[3px] rounded-full bg-black/[0.06]" aria-hidden>
            <div
              className="h-full rounded-full bg-black/35 transition-[margin,width] duration-150"
              style={{ width: `${tabsBar.width}%`, marginLeft: `${tabsBar.left}%` }}
            />
          </div>
        </div>
      )}

      <DeliveryRedirectBanner qrToken={qrToken} redirect={data?.deliveryRedirect} />

      {/* DISH SECTIONS */}
      <main className="space-y-10 px-5 pt-4">
        {filteredCategories.length === 0 && (
          <p className="py-16 text-center text-sm text-muted-foreground">No dishes match.</p>
        )}
        {filteredCategories.map((cat) => (
          <section key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-24">
            <h2 className="mb-4 font-heading text-[20px] font-normal tracking-[-0.01em] text-foreground">
              {cat.name.includes("Starters") ? "Recommended" : cat.name}
            </h2>

            <div className="flex flex-col gap-3">
              {cat.items.map((item) => {
                const qtyInCart = getItemQuantityInCart(item.id);
                const dishImg = getDishImage(item, cat.name);

                return (
                  <article
                    key={item.id}
                    className="group flex min-h-[150px] overflow-hidden rounded-2xl bg-[#111] text-white shadow-[0_16px_30px_-22px_rgba(0,0,0,0.7)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_40px_-22px_rgba(0,0,0,0.8)]"
                  >
                    {/* Photo (opens the dish detail) */}
                    <button
                      type="button"
                      onClick={() => openItemOptions(item, cat.name)}
                      aria-label={`View ${item.name}`}
                      className="relative w-[38%] shrink-0 overflow-hidden bg-neutral-800"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={dishImg}
                        alt={item.name}
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={(e) => {
                          const t = e.currentTarget;
                          const fb = getDishImage({ ...item, imageUrl: null }, cat.name);
                          if (t.src !== fb) t.src = fb;
                        }}
                      />
                    </button>

                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 p-4">
                      <button type="button" onClick={() => openItemOptions(item, cat.name)} className="text-left">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[2px] border bg-white p-[1px]",
                              item.isVeg ? "border-emerald-500" : "border-rose-500"
                            )}
                            role="img"
                            aria-label={item.isVeg ? "Veg" : "Non-veg"}
                          >
                            <span className={cn("h-2 w-2 rounded-full", item.isVeg ? "bg-emerald-500" : "bg-rose-500")} />
                          </span>
                          <span className="text-[10px] text-lime/80">― Highly reordered</span>
                        </div>
                        <h3 className="mt-1.5 text-[15px] leading-snug font-normal text-white">{item.name}</h3>
                        {item.isCombo && (
                          <div className="mt-1 flex flex-col gap-0.5">
                            <span className="inline-flex w-fit items-center rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                              Combo Meal
                            </span>
                            {item.comboComponents && item.comboComponents.length > 0 && (
                              <p className="text-[11px] leading-tight text-white/55">
                                Serves {item.comboComponents.reduce((acc, c) => acc + (c.quantity || 1), 0)} · Includes: {item.comboComponents.map((c) => `${c.quantity}× ${c.componentItem?.name || "Item"}`).join(", ")}
                              </p>
                            )}
                          </div>
                        )}
                        {item.description && (
                          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/55">{item.description}</p>
                        )}
                      </button>

                      <div className="flex items-end justify-between gap-2">
                        <div className="flex flex-col">
                          <span className="tabular text-[15px] text-white">{formatCurrency(item.price)}</span>
                          <span className="text-[10px] text-white/40">customisable</span>
                        </div>
                        {qtyInCart > 0 ? (
                          <div className="flex h-10 items-center rounded-full bg-lime text-lime-foreground">
                            <button
                              type="button"
                              aria-label={`Remove one ${item.name}`}
                              onClick={() => removeSimpleItem(item.id)}
                              className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-black/10"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <span className="tabular w-5 text-center text-sm font-semibold">{qtyInCart}</span>
                            <button
                              type="button"
                              aria-label={`Add one ${item.name}`}
                              onClick={() => addSimpleItem(item, cat.name)}
                              className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-black/10"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openItemOptions(item, cat.name)}
                            className="flex h-10 items-center gap-1 rounded-full bg-white px-4 text-xs font-semibold text-[#1A1A1A] transition-all duration-200 hover:bg-lime active:scale-95"
                          >
                            ADD <Plus className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
        <PoweredByEasyDine tone="light" className="mt-8" />
      </main>

      {/* Floating category menu button */}
      <div className={cn("fixed left-1/2 z-30 -translate-x-1/2 transition-[bottom] duration-300", cartTotalDishes > 0 ? "bottom-24" : "bottom-6")}>
        <button
          onClick={() => setShowCategorySheet(true)}
          className="flex items-center gap-2 rounded-full border border-black/10 bg-white/85 px-4 py-2 text-xs font-medium text-foreground shadow-[0_10px_30px_-12px_rgba(0,0,0,0.3)] backdrop-blur-md transition-all duration-200 hover:-translate-y-px hover:bg-white"
        >
          <MenuIcon className="h-3.5 w-3.5" />
          <span>Menu</span>
        </button>
      </div>

      {/* Sticky cart bar */}
      {cartTotalDishes > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-gradient-to-t from-background via-background/80 to-transparent px-4 pt-6 pb-4">
          <button
            type="button"
            onClick={() => setShowCartDrawer(true)}
            className="mx-auto flex w-full max-w-[488px] items-center justify-between rounded-full bg-[#111] py-2.5 pr-2.5 pl-6 text-white shadow-[0_20px_40px_-20px_rgba(0,0,0,0.7)] transition-all duration-300 hover:-translate-y-0.5"
          >
            <span className="tabular text-sm">
              {cartTotalDishes} {cartTotalDishes === 1 ? "dish" : "dishes"} · ₹{cartTotalPrice.toFixed(0)}
            </span>
            <span className="flex items-center gap-1 rounded-full bg-lime px-5 py-2.5 text-sm font-semibold text-lime-foreground">
              View order
              <ChevronRight className="h-4 w-4" />
            </span>
          </button>
        </div>
      )}

      {/* CATEGORIES MODAL (Image 4 match: media_1794128524574_6508c099.png) */}
      {showCategorySheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-5 text-foreground shadow-2xl">
            <div className="flex flex-col divide-y divide-border">
              {(data?.categories || []).map((cat, idx) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setShowCategorySheet(false);
                    const el = document.getElementById(`cat-${cat.id}`);
                    el?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="flex items-center justify-between py-3.5 text-sm font-bold text-left hover:text-primary transition-colors"
                >
                  <span className={idx === 0 ? "text-primary" : "text-foreground"}>
                    {cat.name}
                  </span>
                  <span className={idx === 0 ? "text-primary" : "text-muted-foreground"}>
                    {cat.items.length}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowCategorySheet(false)}
                className="flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-xs font-bold text-primary-foreground hover:bg-[var(--primary-hover)] shadow-md"
              >
                <span>✕</span>
                <span>Close</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOMISE MODAL WITH AUDIO MIC & EXTRAS */}
      {customizingItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
          <div className="ed-enter max-h-[94vh] w-full max-w-[520px] overflow-y-auto rounded-t-[28px] bg-background p-4 text-foreground shadow-2xl sm:rounded-[28px]">
            {/* Dish detail: large photo, name, price, ingredients */}
            <div className="relative overflow-hidden rounded-[20px] bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getDishImage(customizingItem.item, customizingItem.categoryName)}
                alt={customizingItem.item.name}
                className="aspect-[16/10] w-full object-cover"
                onError={(e) => {
                  const fb = getDishImage({ ...customizingItem.item, imageUrl: null }, customizingItem.categoryName);
                  if (e.currentTarget.src !== fb) e.currentTarget.src = fb;
                }}
              />
              <button
                type="button"
                aria-label="Close"
                onClick={() => setCustomizingItem(null)}
                className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-foreground backdrop-blur transition-colors hover:bg-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 flex items-start justify-between gap-4 px-1">
              <div className="min-w-0">
                <h3 className="font-heading text-[26px] leading-tight font-normal tracking-[-0.02em] text-foreground">
                  {customizingItem.item.name}
                </h3>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span
                    className={cn(
                      "flex h-3.5 w-3.5 items-center justify-center rounded-[2px] border bg-white p-[1px]",
                      customizingItem.item.isVeg ? "border-emerald-500" : "border-rose-500"
                    )}
                  >
                    <span className={cn("h-2 w-2 rounded-full", customizingItem.item.isVeg ? "bg-emerald-500" : "bg-rose-500")} />
                  </span>
                  <span>{customizingItem.item.isVeg ? "Veg" : "Non-veg"}</span>
                  {customizingItem.item.isCombo && <span>· Combo Meal</span>}
                </div>
              </div>
              <p className="tabular shrink-0 pt-1 text-[20px] font-light text-foreground">
                {formatCurrency(customizingItem.item.price)}
              </p>
            </div>
            {customizingItem.item.description && (
              <p className="mt-3 px-1 text-[15px] leading-relaxed text-foreground/80">{customizingItem.item.description}</p>
            )}
            <div className="mt-4 border-t border-border" />

            {/* Cooking Request input + Audio Voice Mic */}
            <div className="mt-4">
              <label className="text-xs font-bold text-foreground/85">Cooking request</label>
              <div className="relative mt-1.5">
                <input
                  type="text"
                  value={cookingNote}
                  onChange={(e) => setCookingNote(e.target.value)}
                  placeholder='e.g. "Extra spicy, less oil"'
                  className="w-full rounded-xl border border-border bg-card py-3 pl-3 pr-10 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={triggerAudioVoiceInput}
                  className={cn(
                    "absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full transition-all",
                    isListeningCustomMic ? "text-red-500 animate-pulse bg-red-500/20" : "text-muted-foreground hover:text-primary"
                  )}
                  title="Speak cooking instructions (your browser may send the audio to its speech service; this app does not save it)"
                >
                  <Mic className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Add-ons & Modifiers (Configured on Menu Item) */}
            {(() => {
              const itemGroups = customizingItem.item.modifierGroups || [];
              const allMods = itemGroups.flatMap((g) => g.modifierGroup.modifiers);
              const selectedMods = allMods.filter((m) => selectedModifierIds.includes(m.id));
              const extraTotal = selectedMods.reduce((sum, m) => sum + parseFloat(m.priceAdjustment || "0"), 0);
              const basePrice = parseFloat(customizingItem.item.price || "0");
              const lineUnitPrice = basePrice + extraTotal;

              const toggleMod = (groupId: string, modId: string, maxSelect: number) => {
                setSelectedModifierIds((prev) => {
                  const grp = itemGroups.find((g) => g.modifierGroup.id === groupId);
                  const grpModIds = grp?.modifierGroup.modifiers.map((m) => m.id) || [];
                  const isChecked = prev.includes(modId);
                  if (isChecked) {
                    return prev.filter((id) => id !== modId);
                  }
                  if (maxSelect === 1) {
                    const withoutGroup = prev.filter((id) => !grpModIds.includes(id));
                    return [...withoutGroup, modId];
                  }
                  const currentCount = prev.filter((id) => grpModIds.includes(id)).length;
                  if (maxSelect > 1 && currentCount >= maxSelect) {
                    toast.info(`You can select at most ${maxSelect} options for this group`);
                    return prev;
                  }
                  return [...prev, modId];
                });
              };

              return (
                <>
                  {itemGroups.map(({ modifierGroup: group }) => {
                    const isSingle = group.maxSelect === 1;
                    return (
                      <div key={group.id} className="mt-4 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-foreground/85">
                            {group.name}
                            {group.isRequired && (
                              <span className="ml-1.5 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                                Required
                              </span>
                            )}
                          </label>
                          <span className="text-[11px] text-muted-foreground">
                            {isSingle ? "Choose 1" : group.maxSelect > 1 ? `Up to ${group.maxSelect}` : "Optional"}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {group.modifiers.map((mod) => {
                            const isChecked = selectedModifierIds.includes(mod.id);
                            const priceAdj = parseFloat(mod.priceAdjustment || "0");
                            return (
                              <label
                                key={mod.id}
                                // preventDefault: a <label> forwards its click to the
                                // <input> inside, which bubbles back here as a second
                                // click and would undo the selection just made.
                                onClick={(e) => {
                                  e.preventDefault();
                                  toggleMod(group.id, mod.id, group.maxSelect);
                                }}
                                className={cn(
                                  "flex cursor-pointer items-center justify-between rounded-xl border p-3 text-xs transition-colors",
                                  isChecked
                                    ? "border-primary bg-accent text-foreground"
                                    : "border-border bg-card text-foreground/85 hover:border-primary/40"
                                )}
                              >
                                <div className="flex items-center gap-2.5">
                                  <input
                                    type={isSingle ? "radio" : "checkbox"}
                                    checked={isChecked}
                                    readOnly
                                    className="h-4 w-4 rounded accent-[var(--primary)]"
                                  />
                                  <span className="font-medium">{mod.name}</span>
                                </div>
                                {priceAdj > 0 && (
                                  <span className="font-semibold text-primary">
                                    +₹{priceAdj.toFixed(0)}
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {/* Quantity Stepper & Add Button */}
                  <div className="mt-5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 rounded-full border border-foreground/20 bg-white px-4 py-2 text-sm font-semibold">
                      <button
                        type="button"
                        onClick={() => setCustomizingQty((q) => Math.max(1, q - 1))}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        −
                      </button>
                      <span>{customizingQty}</span>
                      <button
                        type="button"
                        onClick={() => setCustomizingQty((q) => q + 1)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        for (const { modifierGroup: group } of itemGroups) {
                          const count = selectedModifierIds.filter((id) =>
                            group.modifiers.some((m) => m.id === id)
                          ).length;
                          const min = Math.max(group.minSelect, group.isRequired ? 1 : 0);
                          if (count < min) {
                            toast.error(`Please select at least ${min} option(s) for "${group.name}"`);
                            return;
                          }
                        }

                        const lineId = `line-${customizingItem.item.id}-${Date.now()}`;
                        const extrasList = selectedMods.map((m) => {
                          const p = parseFloat(m.priceAdjustment || "0");
                          return p > 0 ? `${m.name} (+₹${p.toFixed(0)})` : m.name;
                        });

                        setCart((prev) => [
                          ...prev,
                          {
                            id: lineId,
                            menuItemId: customizingItem.item.id,
                            name: customizingItem.item.name,
                            imageUrl: getDishImage(customizingItem.item, customizingItem.categoryName),
                            isVeg: customizingItem.item.isVeg,
                            modifierIds: selectedModifierIds,
                            modifierLabel: extrasList.join(", "),
                            unitPrice: lineUnitPrice,
                            quantity: customizingQty,
                            cookingNote: cookingNote.trim(),
                          },
                        ]);

                        toast.success(`Added ${customizingItem.item.name}`);
                        setCustomizingItem(null);
                      }}
                      className="flex-1 rounded-full bg-lime py-3.5 text-sm font-semibold text-lime-foreground transition-all duration-200 hover:bg-lime-hover active:scale-[0.98]"
                    >
                      Add item · ₹{(lineUnitPrice * customizingQty).toFixed(0)}
                    </button>
                  </div>
                </>
              );
            })()}

            <div className="mt-5 flex justify-center pb-1">
              <button
                type="button"
                onClick={() => setCustomizingItem(null)}
                className="rounded-full border border-foreground px-5 py-2.5 text-sm text-foreground transition-colors duration-200 hover:bg-foreground hover:text-background"
              >
                Go back to {customizingItem.categoryName}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CART / YOUR ORDER DRAWER */}
      {showCartDrawer && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
          <div className="ed-enter w-full max-w-[520px] rounded-t-[28px] sm:rounded-[28px] border border-border bg-background p-5 text-foreground max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground">
                Your order ({isTakeaway ? "Takeaway" : (data?.tableName || "Table")})
              </h3>
              <button
                onClick={() => setShowCartDrawer(false)}
                className="rounded-full bg-secondary p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Cart Items list */}
            <div className="mt-4 divide-y divide-border">
              {cart.map((line) => (
                <div key={line.id} className="flex items-start justify-between py-3">
                  <div className="flex items-start gap-3">
                    <div className="h-12 w-12 overflow-hidden rounded-xl bg-secondary shrink-0 relative flex items-center justify-center">
                      <UtensilsCrossed className="h-5 w-5 text-muted-foreground/80 absolute" />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={line.imageUrl || getDishImage({ name: line.name, imageUrl: null }, "")}
                        alt={line.name}
                        className="h-full w-full object-cover relative z-10"
                        onError={(e) => {
                          const t = e.currentTarget;
                          const fb = getDishImage({ name: line.name, imageUrl: null }, "");
                          if (t.src !== fb) {
                            t.src = fb;
                          } else {
                            t.style.display = "none";
                          }
                        }}
                      />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-foreground">{line.name}</h4>
                      {line.modifierLabel && (
                        <p className="text-[11px] text-primary font-medium">{line.modifierLabel}</p>
                      )}
                      <input
                        type="text"
                        value={line.cookingNote}
                        onChange={(e) => setCartLineNote(line.id, e.target.value)}
                        placeholder="Preference (e.g. spicy, less oil)"
                        aria-label={`Preference for ${line.name}`}
                        maxLength={120}
                        className="mt-1 w-44 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none"
                      />
                      {line.quantity > 1 && (
                        <button
                          type="button"
                          onClick={() => splitCartLine(line.id)}
                          className="mt-1 block text-[10px] font-bold text-primary hover:underline"
                        >
                          + Different preference for 1
                        </button>
                      )}
                      <p className="mt-1 text-xs font-bold text-foreground">₹{line.unitPrice * line.quantity}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1 text-xs font-bold">
                    <button onClick={() => updateCartQuantity(line.id, -1)} className="px-1 text-muted-foreground">
                      −
                    </button>
                    <span>{line.quantity}</span>
                    <button onClick={() => updateCartQuantity(line.id, 1)} className="px-1 text-muted-foreground">
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowCartDrawer(false)}
              className="mt-3 text-xs font-bold text-primary hover:underline"
            >
              + Add more items
            </button>

            <div className="mt-4 border-t border-border pt-3">
              <div className="flex justify-between text-sm font-bold text-foreground">
                <span>Total amount</span>
                <span className="text-base font-black text-primary">₹{cartTotalPrice.toFixed(0)}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={placeOrder.isPending}
              onClick={() => setShowConfirmOrderModal(true)}
              className="mt-5 flex h-13 w-full items-center justify-center rounded-2xl bg-primary text-sm font-black text-primary-foreground hover:bg-[var(--primary-hover)] disabled:opacity-50"
            >
              {placeOrder.isPending ? "Sending order..." : "Place order"}
            </button>
          </div>
        </div>
      )}

            {/* PLACE ORDER CONFIRMATION MODAL */}
      {showConfirmOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-5 text-foreground shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <UtensilsCrossed className="h-5 w-5 text-primary" />
                <h3 className="text-base font-bold text-foreground">Confirm Your Order</h3>
              </div>
              <button
                onClick={() => setShowConfirmOrderModal(false)}
                className="rounded-full bg-secondary p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 text-xs text-muted-foreground">
              Sending to <span className="font-bold text-foreground">{isTakeaway ? "Takeaway" : (data?.tableName || "Table")}</span>
            </div>

            {/* Compact items review */}
            <div className="mt-3 max-h-48 overflow-y-auto space-y-2 rounded-xl border border-border bg-secondary/60 p-3">
              {cart.map((item) => (
                <div key={item.id} className="flex justify-between items-center text-xs gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-secondary relative flex items-center justify-center">
                      <UtensilsCrossed className="h-4 w-4 text-muted-foreground/80 absolute" />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.imageUrl || getDishImage({ name: item.name, imageUrl: null }, "")}
                        alt={item.name}
                        className="h-full w-full object-cover relative z-10"
                        onError={(e) => {
                          const t = e.currentTarget;
                          const fb = getDishImage({ name: item.name, imageUrl: null }, "");
                          if (t.src !== fb) {
                            t.src = fb;
                          } else {
                            t.style.display = "none";
                          }
                        }}
                      />
                    </div>
                    <div className="min-w-0">
                      <span className="font-bold text-foreground block truncate">{item.quantity}× {item.name}</span>
                      {item.modifierLabel && <p className="text-[10px] text-primary truncate">{item.modifierLabel}</p>}
                      {item.cookingNote && <p className="text-[10px] text-muted-foreground italic truncate">“{item.cookingNote}”</p>}
                    </div>
                  </div>
                  <span className="font-semibold text-foreground shrink-0">₹{item.unitPrice * item.quantity}</span>
                </div>
              ))}
            </div>

            {/* Customer Name & 10-Digit Phone */}
            <div className="mt-3 space-y-2.5 rounded-2xl border border-border bg-secondary/40 p-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  Your Name *
                </label>
                <input
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="Enter your name"
                  className="mt-1 w-full rounded-xl border border-input bg-card px-3 py-2 text-xs font-bold text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Mobile Number (10 Digits) *
                  </label>
                  <span className="text-[10px] font-bold text-muted-foreground">
                    {phoneDraft.replace(/\D/g, "").length}/10
                  </span>
                </div>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={phoneDraft}
                  onChange={(e) => setPhoneDraft(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit mobile number"
                  className="mt-1 w-full rounded-xl border border-input bg-card px-3 py-2 text-xs font-bold text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none tracking-wider"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">Total payable</span>
              <span className="text-lg font-black text-primary">₹{cartTotalPrice.toFixed(0)}</span>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={placeOrder.isPending}
                onClick={() => setShowConfirmOrderModal(false)}
                className="flex-1 rounded-xl border border-border bg-card py-3 text-xs font-bold text-foreground/85 hover:bg-secondary"
              >
                Back to Cart
              </button>
              <button
                type="button"
                disabled={placeOrder.isPending}
                onClick={() => {
                  const finalName = nameDraft.trim();
                  if (!finalName) {
                    toast.error("Please enter your name");
                    return;
                  }
                  const cleanPhone = phoneDraft.replace(/\D/g, "").slice(0, 10);
                  if (cleanPhone.length !== 10) {
                    toast.error("Please enter a valid 10-digit mobile number");
                    return;
                  }
                  setGuestName(finalName);
                  setGuestPhone(cleanPhone);
                  sessionStorage.setItem(nameStorageKey, finalName);
                  sessionStorage.setItem(phoneStorageKey, cleanPhone);
                  api.post(`/public/menu/${qrToken}/check-in`, { guestName: finalName, phone: cleanPhone }).catch(() => {});
                  submitOrder(finalName, cleanPhone);
                }}
                className="flex-1 rounded-xl bg-primary py-3 text-xs font-black text-primary-foreground hover:brightness-105 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {placeOrder.isPending ? "Sending..." : "Confirm and Send"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TABLE GAMES MODAL (MENU VIEW) */}
      {showGamesModal && activeOrder && (
        <GamesDialog
          restaurantName={(data as any)?.restaurantName || data?.branchName || "EasyDine"}
          restaurantLogoUrl={(data as any)?.restaurantLogoUrl || (data as any)?.logoUrl}
          onClose={handleCloseGames}
          isOrderPaid={!activeOrder || activeOrder.status === "PAID" || (activeOrder as any).paymentStatus === "PAID"}
          settings={getStoredGameSettings((data as any)?.branchId || null)}
        />
      )}

      {/* CALL WAITER CONFIRMATION MODAL */}
      {showWaiterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-xs rounded-2xl border border-border bg-card p-5 text-center text-foreground">
            <Phone className="mx-auto h-10 w-10 text-primary mb-2" />
            <h3 className="text-base font-bold text-foreground">Call Waiter?</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Notify floor staff to attend {isTakeaway ? "Takeaway counter" : (data?.tableName || "Table")}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowWaiterModal(false)}
                className="flex-1 rounded-xl border border-border bg-card py-2.5 text-xs font-bold text-foreground/85"
              >
                Cancel
              </button>
              <button
                onClick={() => requestService.mutate("WAITER")}
                className="flex-1 rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground hover:bg-[var(--primary-hover)]"
              >
                Yes, call
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
