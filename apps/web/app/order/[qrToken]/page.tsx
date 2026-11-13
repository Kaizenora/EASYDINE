"use client";

import { PoweredByEasyDine } from "@/components/order/powered-by";
import {
  ArrowLeft,
  BellRing,
  Check,
  CheckCircle2,
  Clock,
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
import { use, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { playSuccessChime, vibrateSuccess } from "@/lib/celebrate";
import { formatCurrency, formatOrderNumber } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

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

  // Cart & Placed status
  const [cart, setCart] = useState<CartLine[]>([]);
  const [viewMode, setViewMode] = useState<"MENU" | "TRACKING">("MENU");

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [dietFilter, setDietFilter] = useState<"ALL" | "VEG" | "POPULAR" | "SPICY" | "BREADS">("ALL");

  // Modals
  const [customizingItem, setCustomizingItem] = useState<{ item: PublicMenuItem; categoryName: string } | null>(null);
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([]);
  const [cookingNote, setCookingNote] = useState("");
  const [currentRequestId, setCurrentRequestId] = useState<string>(() => "req_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9));
  const [customizingQty, setCustomizingQty] = useState(1);
  const [isListeningSearchMic, setIsListeningSearchMic] = useState(false);
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

  // Place Order Mutation
  const placeOrder = useMutation({
    mutationFn: () =>
      api.post<{ orderNumber: string }>(`/public/menu/${qrToken}/order`, {
        requestId: currentRequestId,
        guestName: guestName || "Guest",
        guestPhone: guestPhone || undefined,
        notes: cart.map((c) => c.cookingNote).filter(Boolean).join("; ") || undefined,
        items: cart.map((c) => ({
          menuItemId: c.menuItemId,
          quantity: c.quantity,
          modifierIds: c.modifierIds ?? [],
          kitchenNote: c.cookingNote || undefined,
        })),
      }),
    onSuccess: (res: any) => {
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
      setShowConfirmOrderModal(false);
      setShowCartDrawer(false);
      setViewMode("TRACKING");
      queryClient.invalidateQueries({ queryKey: ["public-status", qrToken] });
      toast.success(`Order #${orderNum} placed! Waiting for cashier approval.`);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not place order. Please try again."),
  });

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

  // Working Audio Speech Recognition
  const triggerAudioVoiceInput = (target: "search" | "cooking") => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      const heard = window.prompt("Speak or type your request:");
      if (heard) {
        if (target === "search") setSearchQuery(heard);
        else setCookingNote((prev) => (prev ? `${prev}, ${heard}` : heard));
      }
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "en-IN";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      if (target === "search") setIsListeningSearchMic(true);
      else setIsListeningCustomMic(true);

      toast.info("🎙️ Listening... Speak now!");

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (target === "search") {
          setSearchQuery(transcript);
          toast.success(`Heard: "${transcript}"`);
        } else {
          setCookingNote((prev) => (prev ? `${prev}, ${transcript}` : transcript));
          toast.success(`Added note: "${transcript}"`);
        }
        setIsListeningSearchMic(false);
        setIsListeningCustomMic(false);
      };

      recognition.onerror = () => {
        setIsListeningSearchMic(false);
        setIsListeningCustomMic(false);
        toast.info("Voice input ended. You can also type directly.");
      };

      recognition.onend = () => {
        setIsListeningSearchMic(false);
        setIsListeningCustomMic(false);
      };

      recognition.start();
    } catch {
      setIsListeningSearchMic(false);
      setIsListeningCustomMic(false);
      const heard = window.prompt("Speak or type your request:");
      if (heard) {
        if (target === "search") setSearchQuery(heard);
        else setCookingNote((prev) => (prev ? `${prev}, ${heard}` : heard));
      }
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

  // Loading or Error screen
  if (error) {
    // 404 = this QR code does not match any table (wrong, replaced or rotated
    // code), which retrying cannot fix; anything else is a connection problem.
    const invalidCode = error instanceof ApiError && error.status === 404;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#0C0C0E] px-6 text-center text-white">
        <UtensilsCrossed className="h-12 w-12 text-[#E5A93C]" />
        <h2 className="text-xl font-bold">{invalidCode ? "This QR code is not valid" : "Could not load the menu"}</h2>
        <p className="max-w-xs text-sm text-neutral-400">
          {invalidCode
            ? "It may be old or replaced. Please ask the staff for the current QR card at your table."
            : "Check your internet connection and try again."}
        </p>
        {!invalidCode && <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-xl bg-[#E5A93C] px-6 py-2.5 text-xs font-bold text-black hover:bg-amber-400"
        >
          Retry
        </button>}
      </div>
    );
  }

  // Out-of-service table: the notice only. No menu, cart or ordering.
  if (data?.outOfService) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-3 bg-[#0C0C0E] px-6 text-center text-white">
        <UtensilsCrossed className="h-12 w-12 text-[#E5A93C]" />
        <p className="max-w-xs text-base font-semibold" data-testid="table-out-of-service">
          {data.message || "This table is out of service. Please move to another table. Thank you."}
        </p>
        <PoweredByEasyDine className="absolute bottom-6 left-0 right-0" />
      </div>
    );
  }

  // Session-verification gate: show a neutral loading screen until the first
  // status response arrives and we know whether to restore or wipe the session.
  // This prevents ANY flicker between screens on QR scan.
  if (!sessionVerified) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0C0C0E] text-white">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-neutral-700 border-t-[#E5A93C]" />
        <p className="text-sm text-neutral-500 font-sans">Loading menu…</p>
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0C0C0E] px-6 text-center text-white font-sans">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
          <CheckCircle2 className="h-10 w-10" />
        </div>
        <h2 className="text-2xl font-black text-white">{guestName ? `Thank you, ${guestName}!` : "Thank you!"}</h2>
        <p className="text-sm text-neutral-400">
          {orderNum ? `Order #${orderNum} · ` : ""}Bill settled ✓
        </p>
        <p className="text-xs text-neutral-500 mt-1">
          We hope you enjoyed your meal. See you again soon!
        </p>
        {(orderItems.length > 0 || totalAmt) && (
          <div className="mt-4 rounded-2xl border border-neutral-800 bg-[#141416] p-4 text-left w-full max-w-xs">
            {orderItems.length > 0 && (
              <>
                <p className="text-xs font-bold text-neutral-400 mb-2">Your order</p>
                {orderItems.slice(0, 5).map((it: any, i: number) => (
                  <div key={i} className="py-1.5 border-b border-neutral-900">
                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-300 font-medium">{it.nameSnapshot} × {it.quantity}</span>
                      <span className="text-white font-bold">₹{it.lineTotal || (parseFloat(it.unitPriceSnapshot || "0") * it.quantity).toFixed(0)}</span>
                    </div>
                    {it.kitchenNote && (
                      <p className="mt-0.5 text-[10px] text-amber-400 font-medium">{it.kitchenNote}</p>
                    )}
                  </div>
                ))}
                {orderItems.length > 5 && <p className="text-xs text-neutral-500 mt-1">...and {orderItems.length - 5} more items</p>}
              </>
            )}
            {totalAmt && (
              <div className="flex justify-between font-bold text-sm mt-2 pt-2 border-t border-neutral-800">
                <span>Total paid</span>
                <span className="text-emerald-400">₹{totalAmt}</span>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={handleStartNewOrder}
          className="mt-5 flex h-12 w-full max-w-xs items-center justify-center rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 text-sm font-bold text-black shadow-lg shadow-amber-500/20 transition-all hover:brightness-105 active:scale-[0.98]"
        >
          Start New Order · Browse Menu
        </button>
      </div>
    );
  }

  // 1. WELCOME SCREEN (Image 4 from earlier: Name + Contact Number Input)
  if (!guestName) {
    const tableBadge = isTakeaway ? "🥡 Takeaway & Pickup" : (data?.tableName || "Table");
    return (
      <div className="relative flex min-h-screen flex-col justify-between bg-[#F7F5F0] px-6 py-10 font-sans text-neutral-900">
        <div className="flex flex-col gap-6">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-[#A06C18]">
              <span className="h-2 w-2 rounded-full bg-[#B97A1C]" />
              <span>{isTakeaway ? "TAKEAWAY · ONLINE MENU" : "QR SCANNED · DINE-IN"}</span>
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[#1E1B18]">
              {(data as any)?.restaurantName || data?.branchName || "EasyDine"}
            </h1>
            <p className="mt-1 text-sm font-medium text-neutral-500">
              Ahmednagar · North Indian & Maharashtrian
            </p>
          </div>

          {/* 3 Food preview photos */}
          <div className="grid grid-cols-3 gap-3">
            <div className="aspect-square overflow-hidden rounded-2xl bg-neutral-200 shadow-sm border border-neutral-300/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=300&auto=format&fit=crop&q=80"
                alt="Paneer Tikka"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="aspect-square overflow-hidden rounded-2xl bg-neutral-200 shadow-sm border border-neutral-300/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=300&auto=format&fit=crop&q=80"
                alt="Biryani"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="aspect-square overflow-hidden rounded-2xl bg-neutral-200 shadow-sm border border-neutral-300/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=300&auto=format&fit=crop&q=80"
                alt="Gulab Jamun"
                className="h-full w-full object-cover"
              />
            </div>
          </div>

          {/* Floating Card with Name & Contact input */}
          <div className="rounded-3xl border border-amber-200/60 bg-gradient-to-b from-[#F2EBDC] to-[#E9DFCB] p-6 shadow-sm">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-700/30 bg-amber-500/10 px-3.5 py-1 text-xs font-bold text-amber-900">
              <span>🪑 {tableBadge}</span>
            </div>

            <div className="mt-4">
              <label htmlFor="name-input" className="text-xs font-black uppercase tracking-wider text-neutral-600">
                YOUR NAME
              </label>
              <input
                id="name-input"
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Enter your name"
                className="mt-1.5 w-full rounded-2xl border border-neutral-300/80 bg-[#E6DFD1]/80 px-4 py-3 text-base font-bold text-neutral-900 placeholder:text-neutral-500 focus:border-amber-600 focus:outline-none"
              />
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between">
                <label htmlFor="phone-input" className="text-xs font-black uppercase tracking-wider text-neutral-600">
                  CONTACT NUMBER (10 DIGITS)
                </label>
                <span className="text-[11px] font-semibold text-neutral-500">
                  {phoneDraft.length}/10
                </span>
              </div>
              <input
                id="phone-input"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={10}
                value={phoneDraft}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                  setPhoneDraft(digits);
                }}
                placeholder="10-digit mobile number (e.g. 9876543210)"
                className="mt-1.5 w-full rounded-2xl border border-neutral-300/80 bg-[#E6DFD1]/80 px-4 py-3 text-base font-bold text-neutral-900 placeholder:text-neutral-500 focus:border-amber-600 focus:outline-none tracking-wider"
              />
              {phoneDraft.length > 0 && phoneDraft.length < 10 && (
                <p className="mt-1 text-[11px] font-semibold text-amber-700">
                  {10 - phoneDraft.length} more digit{10 - phoneDraft.length === 1 ? "" : "s"} required
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={confirmCheckIn}
              className="mt-5 flex h-13 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#B97A1C] to-[#C98B26] text-base font-bold text-white shadow-md shadow-amber-900/15 transition-all hover:brightness-105 active:scale-[0.99]"
            >
              Start ordering
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs font-medium text-neutral-500">
          No signup needed · your order goes to this table
        </p>
        <PoweredByEasyDine tone="light" className="mt-3" />
      </div>
    );
  }

  // 2. LIVE ORDER TRACKING SCREEN (Images 1 & 2: Order #24 with Stepper, Bill so far, and Action buttons)
  if (viewMode === "TRACKING" && activeOrder) {
    const isServed = activeOrder.status === "SERVED" || activeOrder.status === "READY" || (activeOrder as any).cookingStatus === "SERVED" || (activeOrder as any).cookingStatus === "READY";
    const isPreparing = activeOrder.status === "PREPARING" || (activeOrder as any).cookingStatus === "PREPARING" || isServed;
    const isAccepted = activeOrder.acceptance === "ACCEPTED" || isPreparing || isServed;

    // Itemized list for "Bill so far"
    const orderItems = activeOrder.items || [];
    const totalAmount = activeOrder.totalAmount || "780";

    return (
      <div className="relative min-h-screen bg-[#0C0C0E] pb-32 font-sans text-white px-4 pt-6">
        {/* Top Header (Image 1 match) */}
        <div>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-black tracking-tight text-white">
              Order {formatOrderNumber(activeOrder.orderNumber || "24")}
            </h1>
            <button
              onClick={() => setViewMode("MENU")}
              className="text-xs font-bold text-amber-400 hover:underline"
            >
              View Menu
            </button>
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            {data?.tableName || "Table"} · {guestName} · placed {formatDeviceTime(activeOrder.placedAt) || formatDeviceTime(new Date().toISOString())}
          </p>
        </div>

        {/* Card 1: Vertical Progress Stepper (Images 1 & 2 match) */}
        <div className="mt-5 rounded-2xl border border-neutral-800 bg-[#141416] p-5 shadow-lg">
          <div className="flex flex-col gap-6 relative">
            {/* Step 1: Accepted by cashier */}
            <div className="flex items-start gap-4 relative">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold transition-all z-10",
                  isAccepted
                    ? "bg-[#E5A93C] text-black"
                    : "border-2 border-neutral-700 bg-neutral-900 text-neutral-500"
                )}
              >
                {isAccepted ? <Check className="h-4 w-4 stroke-[3]" /> : "1"}
              </div>

              {/* Connecting vertical line */}
              <div
                className={cn(
                  "absolute left-4 top-8 w-0.5 h-14 -translate-x-1/2",
                  isAccepted ? "bg-[#E5A93C]" : "bg-neutral-800"
                )}
              />

              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">Accepted by cashier</span>
                  {activeOrder.acceptedAt && (
                    <span className="text-[11px] text-neutral-400">{formatDeviceTime(activeOrder.acceptedAt)}</span>
                  )}
                </div>
                <span className="text-xs text-neutral-400">
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
                    ? "bg-[#E5A93C] text-black"
                    : isPreparing
                    ? "border-2 border-[#E5A93C] bg-amber-500/10 text-amber-300"
                    : "border-2 border-neutral-800 bg-neutral-900 text-neutral-600"
                )}
              >
                {isServed ? (
                  <Check className="h-4 w-4 stroke-[3]" />
                ) : isPreparing ? (
                  <Clock className="h-4 w-4 text-amber-400 animate-spin" />
                ) : (
                  "2"
                )}
              </div>

              {/* Connecting vertical line */}
              <div
                className={cn(
                  "absolute left-4 top-8 w-0.5 h-14 -translate-x-1/2",
                  isServed ? "bg-[#E5A93C]" : "bg-neutral-800"
                )}
              />

              <div className="flex flex-col flex-1">
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-sm font-bold",
                      isPreparing ? "text-[#E5A93C]" : "text-neutral-500"
                    )}
                  >
                    Preparing in kitchen
                  </span>
                  {!isServed && isPreparing && (
                    <span className="rounded-full bg-neutral-900 px-2.5 py-0.5 text-[10px] font-bold text-amber-300 border border-neutral-800">
                      ~15 min
                    </span>
                  )}
                  {activeOrder.preparedAt && (
                    <span className="text-[11px] text-neutral-400">{formatDeviceTime(activeOrder.preparedAt)}</span>
                  )}
                </div>
                <span className="text-xs text-neutral-400">
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
                    ? "bg-[#E5A93C] text-black"
                    : "border-2 border-neutral-800 bg-neutral-900 text-neutral-600"
                )}
              >
                {isServed ? <Check className="h-4 w-4 stroke-[3]" /> : "○"}
              </div>

              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className={cn("text-sm font-bold", isServed ? "text-white" : "text-neutral-500")}>
                    {isTakeaway ? "Ready for pickup at counter" : "Served at your table"}
                  </span>
                  {activeOrder.servedAt && (
                    <span className="text-[11px] text-neutral-400">{formatDeviceTime(activeOrder.servedAt)}</span>
                  )}
                </div>
                <span className="text-xs text-neutral-400">
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
          <div className="mt-3 flex items-center justify-between rounded-2xl border border-amber-500/40 bg-[#161410] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
                <Phone className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Waiter request sent</p>
                <p className="text-xs text-neutral-400">Waiting for staff acknowledgement</p>
              </div>
            </div>
          </div>
        )}

        {hasBillRequest && (
          <div className="mt-3 flex items-center justify-between rounded-2xl border border-amber-500/40 bg-[#161410] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
                <Receipt className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Bill request sent</p>
                <p className="text-xs text-neutral-400">Cashier notified · waiting for acknowledgement</p>
              </div>
            </div>
          </div>
        )}

        {/* Card 2: Bill so far (Image 1 match) */}
        <div className="mt-4 rounded-2xl border border-neutral-800 bg-[#141416] p-5">
          <div className="flex items-center justify-between border-b border-neutral-800/80 pb-3">
            <span className="text-sm font-bold text-white">Bill so far</span>
            <span className="text-[11px] font-bold text-neutral-500 tracking-wider">LIVE</span>
          </div>

          <div className="mt-3 divide-y divide-neutral-900">
            {orderItems.map((item, idx) => (
              <div key={item.id || idx} className="py-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-300 font-medium">
                    {item.nameSnapshot} <span className="text-neutral-500">× {item.quantity}</span>
                  </span>
                  <span className="text-white font-bold">
                    ₹{item.lineTotal || (parseFloat(item.unitPriceSnapshot || "150") * item.quantity).toFixed(0)}
                  </span>
                </div>
                {item.modifiers && item.modifiers.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1.5">
                    {item.modifiers.map((m: any) => {
                      const adj = Number(m.priceAdjSnapshot || 0);
                      return (
                        <span key={m.id} className="text-xs text-amber-300 font-medium">
                          + {m.nameSnapshot} {adj > 0 ? `(+₹${adj})` : ""}
                        </span>
                      );
                    })}
                  </div>
                )}
                {item.kitchenNote && (
                  <p className="mt-0.5 text-xs text-neutral-400">
                    Note: &ldquo;{item.kitchenNote}&rdquo;
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-neutral-800 pt-3">
            <span className="text-base font-black text-white">Total</span>
            <span className="text-xl font-black text-white">₹{totalAmount}</span>
          </div>
        </div>

        {/* Center link: + Add more items (Image 1 match) */}
        <div className="mt-6 text-center">
          <button
            onClick={() => setViewMode("MENU")}
            className="text-sm font-extrabold text-[#E5A93C] hover:underline"
          >
            + Add more items
          </button>
        </div>

        {/* Sticky Bottom Bar (Images 1 & 2 match) */}
        <div className="fixed bottom-0 inset-x-0 z-40 p-4 bg-gradient-to-t from-black via-black/90 to-transparent">
          <div className="flex items-center gap-3">
            {/* Call waiter button */}
            <button
              onClick={() => setShowWaiterModal(true)}
              className={cn(
                "flex-1 flex h-12 items-center justify-center gap-2 rounded-2xl border text-sm font-bold transition-all",
                hasWaiterRequest
                  ? "border-neutral-800 bg-neutral-900 text-neutral-300"
                  : "border-neutral-800 bg-[#141416] text-white hover:bg-neutral-900"
              )}
            >
              <Phone className="h-4 w-4 text-amber-400" />
              {hasWaiterRequest ? "Call waiter again" : "Call waiter"}
            </button>

            {/* Request bill button (Enabled only when order is served, per user instruction) */}
            {hasBillRequest ? (
              <button
                disabled
                className="flex-1 flex h-12 items-center justify-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 text-sm font-bold text-amber-300"
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
                    ? "bg-[#E5A93C] text-black hover:bg-amber-400"
                    : "border border-neutral-800 bg-neutral-900 text-neutral-500 cursor-not-allowed opacity-60"
                )}
                title={!isOrderServed ? "Available after food is served" : "Request bill"}
              >
                <Receipt className="h-4 w-4" />
                Request bill
              </button>
            )}
          </div>
        </div>

        <PoweredByEasyDine className="mt-6 pb-6" />

        {/* Modals for Waiter & Bill */}
        {showWaiterModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-xs rounded-2xl border border-neutral-800 bg-[#161619] p-5 text-center text-white">
              <Phone className="mx-auto h-10 w-10 text-amber-400 mb-2" />
              <h3 className="text-base font-bold text-white">Call Waiter?</h3>
              <p className="mt-1 text-xs text-neutral-400">
                Notify floor staff to attend {data?.tableName || "Table"}
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setShowWaiterModal(false)}
                  className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 py-2.5 text-xs font-bold text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => requestService.mutate("WAITER")}
                  className="flex-1 rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-black hover:bg-amber-400"
                >
                  Yes, call
                </button>
              </div>
            </div>
          </div>
        )}

        {showBillModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-xs rounded-2xl border border-neutral-800 bg-[#161619] p-5 text-center text-white">
              <Receipt className="mx-auto h-10 w-10 text-amber-400 mb-2" />
              <h3 className="text-base font-bold text-white">Request Bill?</h3>
              <p className="mt-1 text-xs text-neutral-400">
                Notify the cashier to prepare and bring your final bill to {data?.tableName || "Table"}.
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setShowBillModal(false)}
                  className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 py-2.5 text-xs font-bold text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => requestService.mutate("BILL")}
                  className="flex-1 rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-black hover:bg-amber-400"
                >
                  Yes, request
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 3. MAIN MENU SCREEN (Image 3: Dark Luxury Theme with Gold Steppers & Mic)
  return (
    <div className="relative min-h-screen bg-[#0C0C0E] pb-32 font-sans text-white">
      {/* C8: Offline banner */}
      {isOffline && (
        <div className="fixed top-0 inset-x-0 z-50 bg-red-600 px-4 py-2 text-center text-xs font-bold text-white">
          ⚠ You are offline — ordering is paused. Check your Wi-Fi.
        </div>
      )}

      {/* Top Header (Image 3 match) */}
      <header className="sticky top-0 z-30 border-b border-neutral-800 bg-[#0C0C0E]/95 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black tracking-tight text-white">
              {(data as any)?.restaurantName || data?.branchName || "EasyDine"}
            </h1>
            <div className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-3 py-0.5 text-xs font-semibold text-neutral-400 border border-neutral-800">
              <span className="text-amber-400 font-bold">{isTakeaway ? "Takeaway" : (data?.tableName || "Table")}</span>
              <span>·</span>
              <span>{guestName}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeOrder && (
              <button
                type="button"
                onClick={() => setViewMode("TRACKING")}
                className="flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-neutral-800"
              >
                <span>Live Order</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowWaiterModal(true)}
              className="flex items-center gap-1.5 rounded-full bg-[#E5A93C] px-3.5 py-1.5 text-xs font-bold text-black shadow-md hover:bg-amber-400 transition-all"
            >
              <Phone className="h-3.5 w-3.5" />
              Call waiter
            </button>
          </div>
        </div>

        {/* Search bar with voice mic (Image 3 match) */}
        <div className="relative mt-3">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            placeholder='Search "paneer"'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 w-full rounded-xl border border-neutral-800 bg-neutral-900/90 pl-10 pr-10 text-xs text-white placeholder-neutral-500 focus:border-[#E5A93C] focus:outline-none transition-all"
          />
          <button
            type="button"
            onClick={() => triggerAudioVoiceInput("search")}
            className={cn(
              "absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full transition-all",
              isListeningSearchMic ? "text-red-500 animate-pulse bg-red-500/20" : "text-neutral-400 hover:text-amber-400"
            )}
            title="Search with voice"
          >
            <Mic className="h-4 w-4" />
          </button>
        </div>

        {/* Filter chips: [🟢 Veg], Popular, Spicy, Breads (Image 3 match) */}
        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 text-xs scrollbar-none">
          <button
            onClick={() => setDietFilter(dietFilter === "VEG" ? "ALL" : "VEG")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition-all border",
              dietFilter === "VEG"
                ? "border-emerald-500 bg-emerald-950/60 text-emerald-300"
                : "border-neutral-800 bg-neutral-900 text-neutral-300 hover:text-white"
            )}
          >
            <span className="flex h-3 w-3 items-center justify-center rounded-[2px] border border-emerald-400 p-[1.5px]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            Veg
          </button>

          <button
            onClick={() => setDietFilter(dietFilter === "POPULAR" ? "ALL" : "POPULAR")}
            className={cn(
              "rounded-full px-3.5 py-1 font-semibold transition-all border",
              dietFilter === "POPULAR"
                ? "border-amber-500 bg-amber-500/20 text-amber-300"
                : "border-neutral-800 bg-neutral-900 text-neutral-300 hover:text-white"
            )}
          >
            Popular
          </button>

          <button
            onClick={() => setDietFilter(dietFilter === "SPICY" ? "ALL" : "SPICY")}
            className={cn(
              "rounded-full px-3.5 py-1 font-semibold transition-all border",
              dietFilter === "SPICY"
                ? "border-amber-500 bg-amber-500/20 text-amber-300"
                : "border-neutral-800 bg-neutral-900 text-neutral-300 hover:text-white"
            )}
          >
            Spicy
          </button>

          <button
            onClick={() => setDietFilter(dietFilter === "BREADS" ? "ALL" : "BREADS")}
            className={cn(
              "rounded-full px-3.5 py-1 font-semibold transition-all border",
              dietFilter === "BREADS"
                ? "border-amber-500 bg-amber-500/20 text-amber-300"
                : "border-neutral-800 bg-neutral-900 text-neutral-300 hover:text-white"
            )}
          >
            Breads
          </button>
        </div>
      </header>

      {/* DISH SECTIONS (Image 3 match) */}
      <main className="px-4 py-4 space-y-6">
        {filteredCategories.map((cat) => (
          <section key={cat.id} id={`cat-${cat.id}`}>
            <div className="flex items-center justify-between border-b border-neutral-800/80 pb-2">
              <h2 className="text-lg font-bold text-white">
                {cat.name.includes("Starters") ? "Recommended" : cat.name}
              </h2>
            </div>

            <div className="divide-y divide-neutral-900">
              {cat.items.map((item) => {
                const qtyInCart = getItemQuantityInCart(item.id);
                const dishImg = getDishImage(item, cat.name);

                return (
                  <div key={item.id} className="flex items-start justify-between gap-3 py-4">
                    {/* Left: Dish Info */}
                    <div className="flex-1 pr-2">
                      <div className="flex items-center gap-2">
                        {item.isVeg ? (
                          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[2px] border border-emerald-500 p-[1px]">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          </span>
                        ) : (
                          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[2px] border border-rose-500 p-[1px]">
                            <span className="h-2 w-2 rounded-full bg-rose-500" />
                          </span>
                        )}
                        <span className="text-[11px] font-semibold text-amber-400">
                          ― Highly reordered
                        </span>
                      </div>

                      <h3 className="mt-1 text-sm font-bold text-white leading-snug">
                        {item.name}
                      </h3>
                      <div className="mt-1 text-sm font-bold text-white">
                        {formatCurrency(item.price)}
                      </div>

                      {item.description && (
                        <p className="mt-1 text-xs text-neutral-400 line-clamp-2 leading-relaxed">
                          {item.description}
                        </p>
                      )}
                    </div>

                    {/* Right: Dish Photo & Gold Stepper (Image 3 match) */}
                    <div className="relative shrink-0 flex flex-col items-center">
                      <div className="h-24 w-24 overflow-hidden rounded-2xl bg-neutral-800 shadow-md">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={dishImg}
                          alt={item.name}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            const t = e.currentTarget;
                            const fb = getDishImage({ ...item, imageUrl: null }, cat.name);
                            if (t.src !== fb) t.src = fb;
                          }}
                        />
                      </div>

                      <div className="-mt-3.5">
                        {qtyInCart > 0 ? (
                          <div className="flex h-8 items-center gap-3 rounded-xl bg-[#E5A93C] px-3 shadow-lg text-black font-extrabold text-xs">
                            <button
                              onClick={() => removeSimpleItem(item.id)}
                              className="px-1 text-sm hover:opacity-80"
                            >
                              −
                            </button>
                            <span className="w-3 text-center">{qtyInCart}</span>
                            <button
                              onClick={() => addSimpleItem(item, cat.name)}
                              className="px-1 text-sm hover:opacity-80"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              const defaultMods = (item.modifierGroups || [])
                                .flatMap((g) => g.modifierGroup.modifiers)
                                .filter((m) => m.isDefault)
                                .map((m) => m.id);
                              setCustomizingItem({ item, categoryName: cat.name });
                              setCustomizingQty(1);
                              setCookingNote("");
                              setSelectedModifierIds(defaultMods);
                            }}
                            className="flex h-8 items-center rounded-xl bg-[#E5A93C] px-3.5 text-xs font-bold text-black shadow-lg hover:bg-amber-400"
                          >
                            ADD +
                          </button>
                        )}
                      </div>
                      <span className="mt-1 text-[10px] text-neutral-500">customisable</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        <PoweredByEasyDine className="mt-8" />
      </main>

      {/* Floating Category Menu Button (Image 3 match: [ ☰ Menu ]) */}
      <div className="fixed bottom-20 left-1/2 z-30 -translate-x-1/2">
        <button
          onClick={() => setShowCategorySheet(true)}
          className="flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-900/90 px-4 py-2 text-xs font-bold text-white shadow-2xl backdrop-blur-md hover:bg-neutral-800"
        >
          <span>☰ Menu</span>
        </button>
      </div>

      {/* Sticky Bottom Bar (Image 3 match: 3 dishes · ₹620   View order >) */}
      {cartTotalDishes > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 p-4 bg-gradient-to-t from-black via-black/80 to-transparent">
          <div
            onClick={() => setShowCartDrawer(true)}
            className="flex cursor-pointer items-center justify-between rounded-2xl bg-[#E5A93C] p-4 font-bold text-black shadow-xl hover:bg-amber-400"
          >
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-black/80">
                {cartTotalDishes} {cartTotalDishes === 1 ? "dish" : "dishes"} · ₹{cartTotalPrice.toFixed(0)}
              </span>
              <span className="text-base font-black">View order</span>
            </div>

            <div className="flex items-center gap-1 text-base font-extrabold">
              <span>›</span>
            </div>
          </div>
        </div>
      )}

      {/* CATEGORIES MODAL (Image 4 match: media_1794128524574_6508c099.png) */}
      {showCategorySheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl border border-neutral-800 bg-[#161619] p-5 text-white shadow-2xl">
            <div className="flex flex-col divide-y divide-neutral-800/80">
              {(data?.categories || []).map((cat, idx) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setShowCategorySheet(false);
                    const el = document.getElementById(`cat-${cat.id}`);
                    el?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="flex items-center justify-between py-3.5 text-sm font-bold text-left hover:text-amber-400 transition-colors"
                >
                  <span className={idx === 0 ? "text-[#E5A93C]" : "text-white"}>
                    {cat.name}
                  </span>
                  <span className={idx === 0 ? "text-[#E5A93C]" : "text-neutral-500"}>
                    {cat.items.length}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowCategorySheet(false)}
                className="flex items-center gap-1.5 rounded-full bg-[#E5A93C] px-5 py-2 text-xs font-bold text-black hover:bg-amber-400 shadow-md"
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-neutral-800 bg-[#141416] p-5 text-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-neutral-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">{customizingItem.item.name}</h3>
                <p className="text-sm font-black text-[#E5A93C]">
                  {formatCurrency(customizingItem.item.price)}
                </p>
              </div>
              <button
                onClick={() => setCustomizingItem(null)}
                className="rounded-full bg-neutral-800 p-1 text-neutral-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Cooking Request input + Audio Voice Mic */}
            <div className="mt-4">
              <label className="text-xs font-bold text-neutral-300">Cooking request</label>
              <div className="relative mt-1.5">
                <input
                  type="text"
                  value={cookingNote}
                  onChange={(e) => setCookingNote(e.target.value)}
                  placeholder='e.g. "Extra spicy, less oil"'
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900 py-3 pl-3 pr-10 text-xs text-white placeholder-neutral-500 focus:border-[#E5A93C] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => triggerAudioVoiceInput("cooking")}
                  className={cn(
                    "absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full transition-all",
                    isListeningCustomMic ? "text-red-500 animate-pulse bg-red-500/20" : "text-neutral-400 hover:text-amber-400"
                  )}
                  title="Speak cooking instructions"
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
                          <label className="text-xs font-bold text-neutral-300">
                            {group.name}
                            {group.isRequired && (
                              <span className="ml-1.5 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                                Required
                              </span>
                            )}
                          </label>
                          <span className="text-[11px] text-neutral-500">
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
                                onClick={() => toggleMod(group.id, mod.id, group.maxSelect)}
                                className={cn(
                                  "flex cursor-pointer items-center justify-between rounded-xl border p-3 text-xs transition-colors",
                                  isChecked
                                    ? "border-[#E5A93C] bg-amber-500/10 text-white"
                                    : "border-neutral-800 bg-neutral-900/60 text-neutral-300 hover:border-neutral-700"
                                )}
                              >
                                <div className="flex items-center gap-2.5">
                                  <input
                                    type={isSingle ? "radio" : "checkbox"}
                                    checked={isChecked}
                                    readOnly
                                    className="h-4 w-4 rounded accent-[#E5A93C]"
                                  />
                                  <span className="font-medium">{mod.name}</span>
                                </div>
                                {priceAdj > 0 && (
                                  <span className="font-semibold text-amber-400">
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
                    <div className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-bold">
                      <button
                        type="button"
                        onClick={() => setCustomizingQty((q) => Math.max(1, q - 1))}
                        className="text-neutral-400 hover:text-white"
                      >
                        −
                      </button>
                      <span>{customizingQty}</span>
                      <button
                        type="button"
                        onClick={() => setCustomizingQty((q) => q + 1)}
                        className="text-neutral-400 hover:text-white"
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
                      className="flex-1 rounded-xl bg-[#E5A93C] py-3 text-sm font-black text-black hover:bg-amber-400"
                    >
                      Add item · ₹{(lineUnitPrice * customizingQty).toFixed(0)}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* CART / YOUR ORDER DRAWER */}
      {showCartDrawer && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-neutral-800 bg-[#141416] p-5 text-white max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="text-base font-bold text-white">
                Your order ({isTakeaway ? "Takeaway" : (data?.tableName || "Table")})
              </h3>
              <button
                onClick={() => setShowCartDrawer(false)}
                className="rounded-full bg-neutral-800 p-1 text-neutral-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Cart Items list */}
            <div className="mt-4 divide-y divide-neutral-900">
              {cart.map((line) => (
                <div key={line.id} className="flex items-start justify-between py-3">
                  <div className="flex items-start gap-3">
                    <div className="h-12 w-12 overflow-hidden rounded-xl bg-neutral-800 shrink-0 relative flex items-center justify-center">
                      <UtensilsCrossed className="h-5 w-5 text-neutral-600 absolute" />
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
                      <h4 className="text-xs font-bold text-white">{line.name}</h4>
                      {line.modifierLabel && (
                        <p className="text-[11px] text-amber-300 font-medium">{line.modifierLabel}</p>
                      )}
                      <input
                        type="text"
                        value={line.cookingNote}
                        onChange={(e) => setCartLineNote(line.id, e.target.value)}
                        placeholder="Preference (e.g. spicy, less oil)"
                        aria-label={`Preference for ${line.name}`}
                        maxLength={120}
                        className="mt-1 w-44 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-200 placeholder:text-neutral-600 focus:border-amber-500/60 focus:outline-none"
                      />
                      {line.quantity > 1 && (
                        <button
                          type="button"
                          onClick={() => splitCartLine(line.id)}
                          className="mt-1 block text-[10px] font-bold text-amber-400 hover:underline"
                        >
                          + Different preference for 1
                        </button>
                      )}
                      <p className="mt-1 text-xs font-bold text-white">₹{line.unitPrice * line.quantity}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs font-bold">
                    <button onClick={() => updateCartQuantity(line.id, -1)} className="px-1 text-neutral-400">
                      −
                    </button>
                    <span>{line.quantity}</span>
                    <button onClick={() => updateCartQuantity(line.id, 1)} className="px-1 text-neutral-400">
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowCartDrawer(false)}
              className="mt-3 text-xs font-bold text-amber-400 hover:underline"
            >
              + Add more items
            </button>

            <div className="mt-4 border-t border-neutral-800 pt-3">
              <div className="flex justify-between text-sm font-bold text-white">
                <span>Total amount</span>
                <span className="text-base font-black text-amber-400">₹{cartTotalPrice.toFixed(0)}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={placeOrder.isPending}
              onClick={() => setShowConfirmOrderModal(true)}
              className="mt-5 flex h-13 w-full items-center justify-center rounded-2xl bg-[#E5A93C] text-sm font-black text-black hover:bg-amber-400 disabled:opacity-50"
            >
              {placeOrder.isPending ? "Sending order..." : "Place order"}
            </button>
          </div>
        </div>
      )}

            {/* PLACE ORDER CONFIRMATION MODAL */}
      {showConfirmOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl border border-neutral-800 bg-[#161619] p-5 text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <UtensilsCrossed className="h-5 w-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Confirm Your Order</h3>
              </div>
              <button
                onClick={() => setShowConfirmOrderModal(false)}
                className="rounded-full bg-neutral-800 p-1 text-neutral-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 text-xs text-neutral-400">
              Sending to <span className="font-bold text-white">{isTakeaway ? "Takeaway" : (data?.tableName || "Table")}</span>
            </div>

            {/* Compact items review */}
            <div className="mt-3 max-h-48 overflow-y-auto space-y-2 rounded-xl border border-neutral-800/80 bg-neutral-900/50 p-3">
              {cart.map((item) => (
                <div key={item.id} className="flex justify-between items-center text-xs gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-neutral-800 relative flex items-center justify-center">
                      <UtensilsCrossed className="h-4 w-4 text-neutral-600 absolute" />
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
                      <span className="font-bold text-white block truncate">{item.quantity}× {item.name}</span>
                      {item.modifierLabel && <p className="text-[10px] text-amber-300 truncate">{item.modifierLabel}</p>}
                      {item.cookingNote && <p className="text-[10px] text-neutral-400 italic truncate">“{item.cookingNote}”</p>}
                    </div>
                  </div>
                  <span className="font-semibold text-neutral-200 shrink-0">₹{item.unitPrice * item.quantity}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-neutral-800 pt-3">
              <span className="text-xs text-neutral-400">Total payable</span>
              <span className="text-lg font-black text-amber-400">₹{cartTotalPrice.toFixed(0)}</span>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={placeOrder.isPending}
                onClick={() => setShowConfirmOrderModal(false)}
                className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 py-3 text-xs font-bold text-neutral-300 hover:bg-neutral-800"
              >
                Back to Cart
              </button>
              <button
                type="button"
                disabled={placeOrder.isPending}
                onClick={() => placeOrder.mutate()}
                className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 py-3 text-xs font-black text-black hover:brightness-105 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {placeOrder.isPending ? "Sending..." : "Confirm and Send"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CALL WAITER CONFIRMATION MODAL */}
      {showWaiterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-xs rounded-2xl border border-neutral-800 bg-[#161619] p-5 text-center text-white">
            <Phone className="mx-auto h-10 w-10 text-amber-400 mb-2" />
            <h3 className="text-base font-bold text-white">Call Waiter?</h3>
            <p className="mt-1 text-xs text-neutral-400">
              Notify floor staff to attend {isTakeaway ? "Takeaway counter" : (data?.tableName || "Table")}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowWaiterModal(false)}
                className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 py-2.5 text-xs font-bold text-neutral-300"
              >
                Cancel
              </button>
              <button
                onClick={() => requestService.mutate("WAITER")}
                className="flex-1 rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-black hover:bg-amber-400"
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
