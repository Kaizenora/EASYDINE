"use client";

import {
  ArrowLeft,
  BellRing,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Info,
  Leaf,
  MapPin,
  Mic,
  MicOff,
  Minus,
  Phone,
  Plus,
  Receipt,
  Search,
  Share2,
  ShoppingBag,
  Sparkles,
  Star,
  User,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { use, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { playSuccessChime, vibrateSuccess } from "@/lib/celebrate";
import { formatCurrency } from "@/lib/format";

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

function getDishImage(item: PublicMenuItem, catName: string): string {
  if (item.imageUrl) return item.imageUrl;
  const lowerCat = catName.toLowerCase();
  const lowerName = item.name.toLowerCase();
  if (lowerName.includes("biryani") || lowerName.includes("rice") || lowerCat.includes("rice")) return DISH_IMAGE_FALLBACKS.rice;
  if (lowerName.includes("roti") || lowerName.includes("naan") || lowerName.includes("bread") || lowerCat.includes("bread")) return DISH_IMAGE_FALLBACKS.breads;
  if (lowerName.includes("tikka") || lowerName.includes("kebab") || lowerName.includes("corn") || lowerCat.includes("starter")) return DISH_IMAGE_FALLBACKS.starters;
  if (lowerName.includes("shake") || lowerName.includes("drink") || lowerName.includes("lemonade") || lowerCat.includes("beverage")) return DISH_IMAGE_FALLBACKS.drinks;
  if (lowerName.includes("ice cream") || lowerName.includes("kulfi") || lowerCat.includes("dessert")) return DISH_IMAGE_FALLBACKS.dessert;
  if (lowerCat.includes("main") || lowerName.includes("dal") || lowerName.includes("curry") || lowerName.includes("paneer")) return DISH_IMAGE_FALLBACKS.main;
  return DISH_IMAGE_FALLBACKS.default;
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
  id: string; // unique cart line ID so items with different instructions remain separate
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
    items: { id: string; nameSnapshot: string; quantity: number; status: string; kitchenNote?: string }[];
  } | null;
  openRequests: ("WAITER" | "BILL")[];
}

const ITEM_STATUS_LABEL: Record<string, string> = {
  NEW: "Order Sent",
  ACCEPTED: "Accepted by Cashier",
  PREPARING: "Cooking in Kitchen",
  READY: "Ready to Serve",
  SERVED: "Served at Table",
  CANCELLED: "Cancelled",
};

interface PublicMenuCategory {
  id: string;
  name: string;
  items: PublicMenuItem[];
}

interface PublicMenuResponse {
  branchName: string;
  tableName: string;
  categories: PublicMenuCategory[];
}

export default function ZomatoStyleCustomerMenu({
  params,
}: {
  params: Promise<{ qrToken: string }>;
}) {
  const { qrToken } = use(params);
  const nameStorageKey = `qr-guest-name:${qrToken}`;
  const phoneStorageKey = `qr-guest-phone:${qrToken}`;
  const queryClient = useQueryClient();

  // Customer identity
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");

  // Cart
  const [cart, setCart] = useState<CartLine[]>([]);
  const [placed, setPlaced] = useState<{ orderNumber: string } | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [dietFilter, setDietFilter] = useState<"ALL" | "VEG" | "NON_VEG">("ALL");

  // Modals
  const [customizingItem, setCustomizingItem] = useState<{ item: PublicMenuItem; categoryName: string } | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [cookingNote, setCookingNote] = useState("");
  const [customizingQty, setCustomizingQty] = useState(1);
  const [isListeningMic, setIsListeningMic] = useState(false);
  const [isListeningSearchMic, setIsListeningSearchMic] = useState(false);
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [showCartDrawer, setShowCartDrawer] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // Bookmarked items simulation
  const [bookmarked, setBookmarked] = useState<Record<string, boolean>>({});

  // Load customer credentials
  useEffect(() => {
    const savedName = sessionStorage.getItem(nameStorageKey);
    const savedPhone = sessionStorage.getItem(phoneStorageKey);
    if (savedName) setGuestName(savedName);
    if (savedPhone) setGuestPhone(savedPhone);
  }, [nameStorageKey, phoneStorageKey]);

  useEffect(() => {
    if (placed) {
      vibrateSuccess();
      playSuccessChime();
    }
  }, [placed]);

  // Fetch Public Menu
  const { data, isLoading, error } = useQuery({
    queryKey: ["public-menu", qrToken],
    queryFn: () => api.get<PublicMenuResponse>(`/public/menu/${qrToken}`),
    retry: false,
  });

  // Live order status & pending call requests
  const { data: status } = useQuery({
    queryKey: ["public-status", qrToken],
    queryFn: () => api.get<PublicStatus>(`/public/menu/${qrToken}/status`),
    refetchInterval: 5000,
    enabled: !!data,
  });

  // Gating rule: "when food is ordered and confirmed then only open the option of bill requested"
  const isFoodOrderedAndConfirmed = Boolean(
    status?.order &&
      status.order.status !== "NEW" &&
      ["ACCEPTED", "PREPARING", "READY", "SERVED", "COMPLETED"].includes(status.order.status)
  );

  // Call Waiter / Request Bill
  const requestService = useMutation({
    mutationFn: (type: "WAITER" | "BILL") => api.post(`/public/menu/${qrToken}/request`, { type }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["public-status", qrToken] }),
  });

  // Place Order
  const placeOrder = useMutation({
    mutationFn: () =>
      api.post<{ orderNumber: string }>(`/public/menu/${qrToken}/order`, {
        guestName: guestPhone ? `${guestName} (${guestPhone})` : guestName,
        items: cart.map((l) => ({
          menuItemId: l.menuItemId,
          quantity: l.quantity,
          modifierIds: l.modifierIds,
          kitchenNote: l.cookingNote || undefined,
        })),
      }),
    onSuccess: (order) => {
      setPlaced(order);
      setCart([]);
      setShowConfirmModal(false);
      setShowCartDrawer(false);
      queryClient.invalidateQueries({ queryKey: ["public-status", qrToken] });
    },
  });

  const confirmCheckIn = () => {
    const trimmedName = nameDraft.trim();
    const trimmedPhone = phoneDraft.trim();
    if (!trimmedName) return;
    sessionStorage.setItem(nameStorageKey, trimmedName);
    sessionStorage.setItem(phoneStorageKey, trimmedPhone);
    setGuestName(trimmedName);
    setGuestPhone(trimmedPhone);
  };

  // Cart calculations
  const cartCount = cart.reduce((sum, l) => sum + l.quantity, 0);
  const cartTotal = cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const getItemQuantityInCart = (itemId: string) =>
    cart.filter((l) => l.menuItemId === itemId).reduce((sum, l) => sum + l.quantity, 0);

  // Open customisation modal
  const handleOpenCustomize = (item: PublicMenuItem, categoryName: string) => {
    setCustomizingItem({ item, categoryName });
    const defaultMods = (item.modifierGroups ?? []).flatMap((g) =>
      g.modifierGroup.modifiers.filter((m) => m.isDefault).map((m) => m.id)
    );
    setSelectedModifiers(defaultMods);
    setCookingNote("");
    setCustomizingQty(1);
    setIsListeningMic(false);
  };

  // Add line to cart — each distinct cooking note creates its own separate line!
  const commitAddToCart = () => {
    if (!customizingItem) return;
    const { item, categoryName } = customizingItem;
    const extraPrice = (item.modifierGroups ?? []).flatMap((g) =>
      g.modifierGroup.modifiers.filter((m) => selectedModifiers.includes(m.id))
    ).reduce((sum, m) => sum + Number(m.priceAdjustment), 0);

    const modLabels = (item.modifierGroups ?? []).flatMap((g) =>
      g.modifierGroup.modifiers.filter((m) => selectedModifiers.includes(m.id)).map((m) => m.name)
    ).join(", ");

    const trimmedNote = cookingNote.trim();
    const unitPrice = Number(item.price) + extraPrice;
    const imageUrl = getDishImage(item, categoryName);

    setCart((prev) => {
      // Find if an item exists with the exact same modifiers AND exact same note
      const existingIdx = prev.findIndex(
        (l) =>
          l.menuItemId === item.id &&
          l.modifierIds.slice().sort().join(",") === selectedModifiers.slice().sort().join(",") &&
          l.cookingNote === trimmedNote
      );

      if (existingIdx >= 0) {
        // Same note -> increment that specific line
        return prev.map((l, idx) => (idx === existingIdx ? { ...l, quantity: l.quantity + customizingQty } : l));
      }

      // Different note or new -> create a separate distinct cart line!
      const newLine: CartLine = {
        id: `cart-line-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        menuItemId: item.id,
        name: item.name,
        imageUrl,
        isVeg: item.isVeg,
        modifierIds: selectedModifiers,
        modifierLabel: modLabels,
        unitPrice,
        quantity: customizingQty,
        cookingNote: trimmedNote,
      };
      return [...prev, newLine];
    });

    setCustomizingItem(null);
  };

  const removeOneFromCart = (lineId: string) => {
    setCart((prev) =>
      prev
        .map((l) => (l.id === lineId ? { ...l, quantity: l.quantity - 1 } : l))
        .filter((l) => l.quantity > 0)
    );
  };

  const addOneToCart = (lineId: string) => {
    setCart((prev) => prev.map((l) => (l.id === lineId ? { ...l, quantity: l.quantity + 1 } : l)));
  };

  // Web Speech API for voice instructions
  const startSpeechRecognition = () => {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: any }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Voice input is not supported on this browser. You can type instructions directly.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "en-IN";
      recognition.interimResults = true;
      recognition.continuous = false;

      recognition.onstart = () => setIsListeningMic(true);
      recognition.onend = () => setIsListeningMic(false);
      recognition.onerror = () => setIsListeningMic(false);

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join(" ");
        setCookingNote(transcript);
      };

      recognition.start();
    } catch {
      setIsListeningMic(false);
    }
  };

  // Web Speech API for Search Voice Input
  const startSearchVoiceInput = () => {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: any }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Voice search is not supported on this browser.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "en-IN";
      recognition.interimResults = true;
      recognition.continuous = false;

      recognition.onstart = () => setIsListeningSearchMic(true);
      recognition.onend = () => setIsListeningSearchMic(false);
      recognition.onerror = () => setIsListeningSearchMic(false);

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join(" ");
        setSearchQuery(transcript);
      };

      recognition.start();
    } catch {
      setIsListeningSearchMic(false);
    }
  };

  const PREFERENCE_CHIPS = [
    "🌶️ Extra Spicy",
    "🌿 Mild / Less Spicy",
    "🧅 No Onion & Garlic",
    "🧈 Less Butter / Oil",
    "✨ Extra Crispy",
    "🥣 Extra Gravy",
    "👶 Kids Friendly",
    "🥗 Extra Chutney & Salad",
  ];

  const togglePreferenceChip = (chip: string) => {
    setCookingNote((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return chip;
      if (trimmed.includes(chip)) {
        return trimmed.replace(chip, "").replace(/,\s*,/g, ",").replace(/^,\s*|,\s*$/g, "").trim();
      }
      return `${trimmed}, ${chip}`;
    });
  };

  // Filtered categories and dishes
  const filteredCategories = useMemo(() => {
    if (!data?.categories) return [];
    return data.categories
      .map((cat) => {
        const matchingItems = cat.items.filter((item) => {
          if (dietFilter === "VEG" && !item.isVeg) return false;
          if (dietFilter === "NON_VEG" && item.isVeg) return false;
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

  const totalItemCount = useMemo(() => {
    return (data?.categories ?? []).reduce((acc, c) => acc + c.items.length, 0);
  }, [data?.categories]);

  // Error screen
  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#0f0f10] px-6 text-center text-white">
        <UtensilsCrossed className="h-12 w-12 text-rose-500" />
        <h2 className="text-xl font-bold">Table QR Not Found</h2>
        <p className="text-sm text-neutral-400">
          {error instanceof ApiError ? error.message : "Please scan a valid table QR code or call the staff."}
        </p>
      </div>
    );
  }

  // 1. GUEST CHECK-IN SCREEN (Full Name + Mobile Number)
  if (!guestName) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#0d0d0f] px-6 text-center text-white">
        <div className="absolute inset-0 bg-gradient-to-b from-rose-950/20 via-transparent to-black pointer-events-none" />
        <div className="relative z-10 w-full max-w-sm flex flex-col items-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 shadow-xl shadow-rose-600/30">
            <UtensilsCrossed className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">{data?.branchName ?? "EasyDine"}</h1>
          <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-neutral-800/80 px-3 py-1 text-xs font-semibold text-rose-300 border border-neutral-700">
            <MapPin className="h-3 w-3" />
            {data?.tableName ?? "Table Order"}
          </div>

          <form
            className="mt-6 flex w-full flex-col gap-3 text-left"
            onSubmit={(e) => {
              e.preventDefault();
              confirmCheckIn();
            }}
          >
            <div>
              <label htmlFor="guest-name" className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-rose-400" />
                Full Name
              </label>
              <input
                id="guest-name"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                autoFocus
                required
                maxLength={60}
                className="mt-1.5 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:border-rose-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="guest-phone" className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-rose-400" />
                Mobile Number
              </label>
              <input
                id="guest-phone"
                type="tel"
                value={phoneDraft}
                onChange={(e) => setPhoneDraft(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10-digit mobile number"
                required
                maxLength={10}
                className="mt-1.5 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:border-rose-500 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-neutral-500">For order notifications and table service</p>
            </div>

            <button
              type="submit"
              disabled={!nameDraft.trim() || phoneDraft.length < 10}
              className="mt-3 flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-rose-600 to-red-600 font-extrabold text-white shadow-lg shadow-rose-600/30 transition hover:brightness-110 active:scale-95 disabled:opacity-50"
            >
              Continue to Menu
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#0d0d0f] text-neutral-100 pb-36 font-sans">
      {/* 2. TOP HEADER (Zomato Style) */}
      <header className="sticky top-0 z-30 border-b border-neutral-800/80 bg-[#0d0d0f]/95 backdrop-blur-md px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setGuestName("")}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-800/80 text-neutral-300 hover:text-white"
            title="Change name/number"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          {/* Search bar with Voice Mic */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder={isListeningSearchMic ? "Listening... Speak dish name..." : 'Search "dal", "paneer", "biryani"...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`h-10 w-full rounded-full border bg-neutral-900 pl-10 pr-16 text-xs text-white placeholder-neutral-400 focus:outline-none transition ${
                isListeningSearchMic ? "border-rose-500 ring-2 ring-rose-500/30" : "border-neutral-800 focus:border-rose-500"
              }`}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="p-1 text-neutral-400 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={startSearchVoiceInput}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition ${
                  isListeningSearchMic
                    ? "bg-rose-600 text-white animate-pulse"
                    : "text-neutral-400 hover:bg-neutral-800 hover:text-rose-400"
                }`}
                title="Search menu by voice"
              >
                <Mic className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Table Badge */}
          <div className="flex h-9 items-center gap-1.5 rounded-full bg-rose-950/40 border border-rose-800/60 px-3 text-[11px] font-bold text-rose-300">
            <span>{data?.tableName ?? "Table"}</span>
          </div>
        </div>

        {/* Restaurant Hero Details */}
        <div className="mt-4 pt-2 border-t border-neutral-800/40">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-xl font-extrabold tracking-tight text-white">{data?.branchName ?? "Easy Dine"}</h1>
                <Info className="h-4 w-4 text-neutral-400" />
              </div>
              <p className="mt-0.5 text-xs text-neutral-400 flex items-center gap-1">
                <MapPin className="h-3 w-3 text-rose-400" /> Dine-in · Guest: <strong className="text-neutral-200">{guestName}</strong>
              </p>
              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-neutral-400">
                <span className="flex items-center gap-1 text-emerald-400 font-semibold bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/40">
                  <Clock className="h-3 w-3" /> 15-20 mins prep
                </span>
                <span>·</span>
                <span className="text-neutral-300">Fresh Kitchen & Tandoor</span>
              </div>
            </div>

            {/* Rating badge */}
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-1 rounded-lg bg-emerald-700 px-2 py-1 text-xs font-bold text-white shadow-sm">
                <span>4.8</span>
                <Star className="h-3 w-3 fill-current" />
              </div>
              <span className="mt-1 text-[10px] text-neutral-400">1.2k+ reviews</span>
            </div>
          </div>

          {/* Quick Service Action Pills */}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => requestService.mutate("WAITER")}
              disabled={requestService.isPending || status?.openRequests.includes("WAITER")}
              className="flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900/90 px-3.5 py-1.5 text-xs font-semibold text-neutral-200 hover:border-rose-500 hover:text-white transition disabled:opacity-60"
            >
              <BellRing className="h-3.5 w-3.5 text-amber-400" />
              {status?.openRequests.includes("WAITER") ? "Waiter Alerted" : "Call Waiter"}
            </button>

            {/* Bill Requested is ONLY opened when food is ordered and confirmed by kitchen/cashier */}
            {isFoodOrderedAndConfirmed && (
              <button
                onClick={() => requestService.mutate("BILL")}
                disabled={requestService.isPending || status?.openRequests.includes("BILL")}
                className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
                  status?.openRequests.includes("BILL")
                    ? "border-emerald-600/80 bg-emerald-950/60 text-emerald-300 shadow-sm"
                    : "border-neutral-700 bg-neutral-900/90 text-neutral-200 hover:border-emerald-500 hover:text-white"
                }`}
              >
                <Receipt className="h-3.5 w-3.5 text-emerald-400" />
                {status?.openRequests.includes("BILL") ? "Bill Requested" : "Request Bill"}
              </button>
            )}
          </div>
        </div>

        {/* Diet Filter Pills */}
        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 text-xs scrollbar-none">
          <button
            onClick={() => setDietFilter("ALL")}
            className={`rounded-full px-3.5 py-1.5 font-medium transition ${
              dietFilter === "ALL" ? "bg-white text-black font-bold" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
            }`}
          >
            All Items
          </button>
          <button
            onClick={() => setDietFilter("VEG")}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium transition border ${
              dietFilter === "VEG"
                ? "bg-emerald-950 border-emerald-500 text-emerald-300 font-bold"
                : "bg-neutral-800/80 border-neutral-700 text-neutral-300 hover:bg-neutral-700"
            }`}
          >
            <span className="flex h-3 w-3 items-center justify-center rounded-[2px] border border-emerald-400 p-[1.5px]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            Veg Only
          </button>
          <button
            onClick={() => setDietFilter("NON_VEG")}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium transition border ${
              dietFilter === "NON_VEG"
                ? "bg-rose-950 border-rose-500 text-rose-300 font-bold"
                : "bg-neutral-800/80 border-neutral-700 text-neutral-300 hover:bg-neutral-700"
            }`}
          >
            <span className="flex h-3 w-3 items-center justify-center rounded-[2px] border border-rose-500 p-[1.5px]">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            </span>
            Non-Veg
          </button>
        </div>
      </header>

      {/* 3. LIVE ORDER STATUS BANNER */}
      {status?.order && (
        <div className="mx-4 mt-3 overflow-hidden rounded-2xl border border-rose-900/50 bg-gradient-to-r from-rose-950/40 via-neutral-900 to-neutral-900 p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                Order #{status.order.orderNumber}
              </span>
            </div>
            <span className="rounded-full bg-emerald-950 border border-emerald-700/60 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
              {ITEM_STATUS_LABEL[status.order.status] ?? status.order.status}
            </span>
          </div>

          <div className="mt-2.5 border-t border-neutral-800/60 pt-2 text-xs text-neutral-300 space-y-1">
            {status.order.items.map((it) => (
              <div key={it.id} className="flex justify-between items-center">
                <span>
                  {it.quantity} × {it.nameSnapshot}
                  {it.kitchenNote && <span className="text-[10px] text-amber-300/90 ml-1.5 font-medium bg-amber-950/50 px-1 py-0.5 rounded">Note: {it.kitchenNote}</span>}
                </span>
                <span className="text-[10px] text-neutral-400 uppercase font-medium">{it.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. DISH SECTIONS */}
      <main className="px-4 py-4 space-y-8">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 rounded-2xl bg-neutral-900 animate-pulse" />
            ))}
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="py-16 text-center text-neutral-400">
            <UtensilsCrossed className="mx-auto h-10 w-10 text-neutral-600 mb-2" />
            <p className="text-sm font-medium">No dishes match your search</p>
          </div>
        ) : (
          filteredCategories.map((category) => {
            const isCollapsed = collapsedCategories[category.id] ?? false;
            return (
              <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-24">
                {/* Category Header */}
                <button
                  onClick={() =>
                    setCollapsedCategories((prev) => ({ ...prev, [category.id]: !isCollapsed }))
                  }
                  className="flex w-full items-center justify-between pb-2 border-b border-neutral-800 text-left"
                >
                  <h2 className="text-base font-extrabold tracking-tight text-white flex items-center gap-2">
                    {category.name}
                    <span className="text-xs font-semibold text-rose-400">({category.items.length})</span>
                  </h2>
                  <ChevronDown
                    className={`h-4 w-4 text-neutral-400 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                  />
                </button>

                {/* Dish Cards */}
                {!isCollapsed && (
                  <div className="divide-y divide-neutral-800/80">
                    {category.items.map((item) => {
                      const qtyInCart = getItemQuantityInCart(item.id);
                      const isItemBookmarked = bookmarked[item.id] ?? false;
                      const dishImg = getDishImage(item, category.name);

                      return (
                        <div key={item.id} className="flex items-start justify-between gap-4 py-4">
                          {/* Left: Info */}
                          <div className="flex-1 pr-2">
                            {/* Veg / Non-Veg Icon */}
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
                              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                                ★ Highly reordered
                              </span>
                            </div>

                            {/* Title & Price */}
                            <h3 className="mt-1 text-sm font-bold text-white leading-snug">{item.name}</h3>
                            <div className="mt-1 flex items-baseline gap-2">
                              <span className="text-sm font-extrabold text-white">{formatCurrency(item.price)}</span>
                              <span className="text-xs text-neutral-500 line-through">
                                {formatCurrency(Number(item.price) * 1.25)}
                              </span>
                            </div>

                            {/* Description / Specifications */}
                            {item.description && (
                              <p className="mt-1 text-xs text-neutral-400 line-clamp-2 leading-relaxed">
                                {item.description}
                              </p>
                            )}

                            {/* Action Icons */}
                            <div className="mt-2.5 flex items-center gap-3 text-neutral-500">
                              <button
                                onClick={() => setBookmarked((prev) => ({ ...prev, [item.id]: !isItemBookmarked }))}
                                className={`hover:text-white transition ${isItemBookmarked ? "text-rose-500 fill-current" : ""}`}
                              >
                                <Bookmark className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => {
                                  if (navigator.share) {
                                    navigator.share({ title: item.name, text: `Check out ${item.name} at ${data?.branchName}` }).catch(() => {});
                                  }
                                }}
                                className="hover:text-white transition"
                              >
                                <Share2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          {/* Right: Photo + ADD button */}
                          <div className="relative shrink-0 flex flex-col items-center">
                            <div className="h-28 w-28 overflow-hidden rounded-2xl bg-neutral-800 shadow-md">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={dishImg}
                                alt={item.name}
                                className="h-full w-full object-cover transition duration-300 hover:scale-105"
                                loading="lazy"
                              />
                            </div>

                            {/* Floating ADD button on dish card */}
                            <div className="-mt-4 z-10 flex flex-col items-center">
                              {qtyInCart > 0 ? (
                                <div className="flex h-8 items-center justify-between rounded-lg bg-rose-600 px-2 text-xs font-black text-white shadow-lg shadow-rose-600/30 min-w-[86px]">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const matchingLine = [...cart].reverse().find((l) => l.menuItemId === item.id);
                                      if (matchingLine) removeOneFromCart(matchingLine.id);
                                    }}
                                    className="flex h-6 w-6 items-center justify-center rounded hover:bg-black/20 active:scale-90"
                                    title="Decrease quantity"
                                  >
                                    <Minus className="h-3.5 w-3.5" />
                                  </button>
                                  <span className="px-1.5 text-xs font-black">{qtyInCart}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenCustomize(item, category.name);
                                    }}
                                    className="flex h-6 w-6 items-center justify-center rounded hover:bg-black/20 active:scale-90"
                                    title="Add more / customize"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenCustomize(item, category.name)}
                                  className="flex h-8 items-center justify-center gap-1 rounded-lg border border-neutral-700 bg-neutral-900/95 px-5 text-xs font-black uppercase text-rose-500 shadow-md transition hover:border-rose-500 hover:bg-rose-600 hover:text-white active:scale-95"
                                >
                                  <span>ADD</span>
                                  <span className="text-[11px] font-bold -mt-0.5">+</span>
                                </button>
                              )}
                              <span
                                className="mt-0.5 text-[9px] font-semibold text-neutral-400 cursor-pointer hover:text-rose-400"
                                onClick={() => handleOpenCustomize(item, category.name)}
                              >
                                customisable
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })
        )}

        {/* Designer Brand Credit */}
        <div className="mt-10 mb-20 flex flex-col items-center justify-center gap-1.5 py-6 border-t border-neutral-800/80 text-center">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/designer-logo.png" alt="SG" className="h-5 w-5 object-contain" />
            <span className="text-xs font-semibold text-neutral-300">Designed by SG Design &amp; Tech</span>
          </div>
          <p className="text-[10px] text-neutral-500">Contactless QR Dine-in • Hotel Sanjog</p>
        </div>
      </main>

      {/* 5. FLOATING "🍽 MENU" PILL */}
      <div className="fixed bottom-20 right-4 z-20">
        <button
          onClick={() => setShowCategorySheet(true)}
          className="flex items-center gap-2 rounded-full bg-black/90 border border-neutral-700 px-4 py-2.5 text-xs font-bold text-white shadow-xl shadow-black/60 backdrop-blur hover:border-rose-500 transition active:scale-95"
        >
          <UtensilsCrossed className="h-4 w-4 text-rose-500" />
          <span>Menu ({totalItemCount})</span>
        </button>
      </div>

      {/* 6. FLOATING VIEW CART BAR */}
      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-800 bg-[#121214]/95 backdrop-blur-lg px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.7)]">
          <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-neutral-400">
                {cartCount} {cartCount === 1 ? "Item" : "Items"} in Cart
              </p>
              <p className="text-lg font-black text-white">{formatCurrency(cartTotal)}</p>
            </div>

            <button
              onClick={() => setShowCartDrawer(true)}
              className="flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 px-6 font-bold text-white shadow-lg shadow-rose-600/40 hover:brightness-110 active:scale-95 transition"
            >
              <ShoppingBag className="h-4 w-4" />
              <span>View Cart</span>
            </button>
          </div>
        </div>
      )}

      {/* 7. CUSTOMISATION & COOKING REQUEST MODAL (Supports distinct notes per portion) */}
      {customizingItem && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-neutral-800 bg-[#161618] p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 overflow-hidden rounded-xl bg-neutral-800 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getDishImage(customizingItem.item, customizingItem.categoryName)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    {customizingItem.item.isVeg ? (
                      <span className="flex h-3 w-3 items-center justify-center rounded-[2px] border border-emerald-500 p-[1px]">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      </span>
                    ) : (
                      <span className="flex h-3 w-3 items-center justify-center rounded-[2px] border border-rose-500 p-[1px]">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                      </span>
                    )}
                    <h3 className="text-sm font-bold text-white">{customizingItem.item.name}</h3>
                  </div>
                  <p className="text-xs font-semibold text-rose-400 mt-0.5">
                    {formatCurrency(customizingItem.item.price)}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setCustomizingItem(null)}
                className="rounded-full bg-neutral-800 p-1.5 text-neutral-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modifiers List */}
            {(customizingItem.item.modifierGroups ?? []).length > 0 && (
              <div className="mt-4 space-y-4">
                {customizingItem.item.modifierGroups!.map(({ modifierGroup }) => (
                  <div key={modifierGroup.id} className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                      {modifierGroup.name}
                    </p>
                    <div className="space-y-1.5">
                      {modifierGroup.modifiers.map((mod) => {
                        const isChecked = selectedModifiers.includes(mod.id);
                        return (
                          <label
                            key={mod.id}
                            className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-medium cursor-pointer transition ${
                              isChecked
                                ? "border-rose-500 bg-rose-950/20 text-white"
                                : "border-neutral-800 bg-neutral-900/60 text-neutral-300"
                            }`}
                          >
                            <span>{mod.name}</span>
                            <div className="flex items-center gap-2">
                              {Number(mod.priceAdjustment) > 0 && (
                                <span className="text-neutral-400">+{formatCurrency(mod.priceAdjustment)}</span>
                              )}
                              <input
                                type={modifierGroup.maxSelect === 1 ? "radio" : "checkbox"}
                                name={modifierGroup.id}
                                checked={isChecked}
                                onChange={(e) => {
                                  if (modifierGroup.maxSelect === 1) {
                                    setSelectedModifiers((prev) => [
                                      ...prev.filter(
                                        (id) => !modifierGroup.modifiers.some((m) => m.id === id)
                                      ),
                                      mod.id,
                                    ]);
                                  } else {
                                    if (e.target.checked) setSelectedModifiers((prev) => [...prev, mod.id]);
                                    else setSelectedModifiers((prev) => prev.filter((id) => id !== mod.id));
                                  }
                                }}
                                className="accent-rose-500 h-4 w-4"
                              />
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Cooking Request for THIS portion */}
            <div className="mt-5 rounded-2xl border border-neutral-800/80 bg-neutral-900/60 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  Cooking instruction for this item:
                </span>
                <button
                  type="button"
                  onClick={startSpeechRecognition}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                    isListeningMic
                      ? "bg-rose-600 text-white animate-pulse"
                      : "bg-neutral-800 text-neutral-300 hover:text-white"
                  }`}
                  title="Speak instruction"
                >
                  {isListeningMic ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />}
                  {isListeningMic ? "Listening..." : "Speak"}
                </button>
              </div>

              <p className="mt-1 text-[10px] text-neutral-400">
                Want this one spicy, crispy, or mild? Select quick preferences or speak:
              </p>

              {/* Quick Preferences Chips */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PREFERENCE_CHIPS.map((chip) => {
                  const isSelected = cookingNote.includes(chip);
                  return (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => togglePreferenceChip(chip)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition ${
                        isSelected
                          ? "border-rose-500 bg-rose-950/40 text-rose-300 font-bold"
                          : "border-neutral-800 bg-neutral-900/80 text-neutral-300 hover:border-neutral-700"
                      }`}
                    >
                      {chip}
                    </button>
                  );
                })}
              </div>

              <textarea
                rows={2}
                maxLength={100}
                value={cookingNote}
                onChange={(e) => setCookingNote(e.target.value)}
                placeholder='e.g. "Spicy", "No butter", or "Extra crispy"'
                className="mt-2.5 w-full rounded-xl border border-neutral-800 bg-[#111113] p-2.5 text-xs text-white placeholder-neutral-500 focus:border-rose-500 focus:outline-none"
              />
              <div className="text-right text-[10px] text-neutral-500">{cookingNote.length}/100</div>
            </div>

            {/* Modal Bottom Bar: Stepper + Add Button */}
            <div className="mt-5 flex items-center gap-3">
              <div className="flex items-center rounded-xl border border-rose-500/60 bg-neutral-900 px-2 py-1">
                <button
                  type="button"
                  onClick={() => setCustomizingQty((q) => Math.max(1, q - 1))}
                  className="p-1 text-rose-400 hover:text-white"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-8 text-center text-sm font-bold text-white">{customizingQty}</span>
                <button
                  type="button"
                  onClick={() => setCustomizingQty((q) => q + 1)}
                  className="p-1 text-rose-400 hover:text-white"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={commitAddToCart}
                className="flex-1 h-12 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 text-sm font-extrabold text-white shadow-lg shadow-rose-600/40 hover:brightness-110 active:scale-95 transition"
              >
                Add item · {formatCurrency(
                  (Number(customizingItem.item.price) +
                    (customizingItem.item.modifierGroups ?? []).flatMap((g) =>
                      g.modifierGroup.modifiers.filter((m) => selectedModifiers.includes(m.id))
                    ).reduce((sum, m) => sum + Number(m.priceAdjustment), 0)) * customizingQty
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. CATEGORY QUICK JUMP SHEET */}
      {showCategorySheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-t-3xl border border-neutral-800 bg-[#161618] p-5 shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-base font-extrabold text-white">Menu Categories</h3>
              <button
                onClick={() => setShowCategorySheet(false)}
                className="rounded-full bg-neutral-800 p-1.5 text-neutral-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-2">
              {filteredCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setShowCategorySheet(false);
                    const el = document.getElementById(`cat-${cat.id}`);
                    if (el) el.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold text-neutral-200 hover:bg-neutral-800/80 transition"
                >
                  <span>{cat.name}</span>
                  <span className="rounded-full bg-neutral-800 px-2.5 py-0.5 text-xs font-bold text-rose-400">
                    {cat.items.length}
                  </span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowCategorySheet(false)}
              className="mt-2 flex h-11 w-full items-center justify-center gap-1 rounded-xl bg-neutral-800 text-xs font-bold text-neutral-300 hover:bg-neutral-700"
            >
              <X className="h-4 w-4" /> Close
            </button>
          </div>
        </div>
      )}

      {/* 9. CART DRAWER (With Separate Lines for Different Instructions!) */}
      {showCartDrawer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-t-3xl border border-neutral-800 bg-[#161618] p-5 shadow-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div>
                <h3 className="text-base font-extrabold text-white">Your Cart</h3>
                <p className="text-xs text-neutral-400">{data?.branchName} · {data?.tableName}</p>
              </div>
              <button
                onClick={() => setShowCartDrawer(false)}
                className="rounded-full bg-neutral-800 p-1.5 text-neutral-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto py-3 divide-y divide-neutral-800/80 space-y-2">
              {cart.map((line) => (
                <div key={line.id} className="flex items-start justify-between gap-3 pt-2">
                  <div className="flex items-start gap-3 flex-1">
                    {line.imageUrl && (
                      <div className="h-12 w-12 overflow-hidden rounded-xl bg-neutral-800 shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={line.imageUrl} alt="" className="h-full w-full object-cover" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-1.5">
                        {line.isVeg ? (
                          <span className="flex h-3 w-3 items-center justify-center rounded-[2px] border border-emerald-500 p-[1px]">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          </span>
                        ) : (
                          <span className="flex h-3 w-3 items-center justify-center rounded-[2px] border border-rose-500 p-[1px]">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                          </span>
                        )}
                        <p className="text-xs font-bold text-white">{line.name}</p>
                      </div>

                      {line.modifierLabel && (
                        <p className="text-[11px] text-neutral-400 mt-0.5">{line.modifierLabel}</p>
                      )}

                      {/* Display cooking note for this line */}
                      {line.cookingNote ? (
                        <p className="text-[10px] text-amber-300 font-semibold mt-1 bg-amber-950/60 px-2 py-0.5 rounded inline-block border border-amber-800/50">
                          Note: &quot;{line.cookingNote}&quot;
                        </p>
                      ) : (
                        <p className="text-[10px] text-neutral-500 mt-0.5 italic">Standard preparation</p>
                      )}

                      <p className="text-xs font-bold text-neutral-200 mt-1">
                        {formatCurrency(line.unitPrice * line.quantity)}
                      </p>
                    </div>
                  </div>

                  {/* Stepper */}
                  <div className="flex items-center rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1">
                    <button
                      type="button"
                      onClick={() => removeOneFromCart(line.id)}
                      className="p-1 text-neutral-400 hover:text-white"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-6 text-center text-xs font-bold text-white">{line.quantity}</span>
                    <button
                      type="button"
                      onClick={() => addOneToCart(line.id)}
                      className="p-1 text-neutral-400 hover:text-white"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Bill Summary */}
            <div className="mt-3 border-t border-neutral-800 pt-3 space-y-1 text-xs">
              <div className="flex justify-between text-neutral-400">
                <span>Item Total</span>
                <span>{formatCurrency(cartTotal)}</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>Taxes & Service (GST)</span>
                <span className="text-emerald-400">Included in prices</span>
              </div>
              <div className="flex justify-between text-sm font-extrabold text-white pt-2 border-t border-neutral-800">
                <span>Grand Total</span>
                <span>{formatCurrency(cartTotal)}</span>
              </div>
            </div>

            {/* PLACE ORDER BUTTON -> OPENS ONCE CONFIRMATION MODAL */}
            <div className="mt-4 pt-2">
              <button
                disabled={placeOrder.isPending || cart.length === 0}
                onClick={() => setShowConfirmModal(true)}
                className="flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-rose-600 to-red-600 font-extrabold text-white shadow-lg shadow-rose-600/40 hover:brightness-110 active:scale-95 transition disabled:opacity-50"
              >
                Place Order ({formatCurrency(cartTotal)})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 10. ONCE CONFIRMATION MODAL BEFORE PLACING ORDER */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-3xl border border-neutral-800 bg-[#161618] p-5 shadow-2xl text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-950/60 border border-rose-800/60 text-rose-400">
              <UtensilsCrossed className="h-7 w-7" />
            </div>

            <h3 className="text-lg font-black text-white">Confirm Your Order?</h3>
            <p className="mt-1 text-xs text-neutral-400">
              Table: <strong className="text-neutral-200">{data?.tableName}</strong> · Guest: <strong className="text-neutral-200">{guestName}</strong>
            </p>

            <div className="my-4 max-h-40 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 text-left text-xs space-y-1.5 divide-y divide-neutral-800/60">
              {cart.map((line) => (
                <div key={line.id} className="pt-1.5 first:pt-0 flex justify-between items-start">
                  <div>
                    <span className="font-semibold text-white">{line.quantity} × {line.name}</span>
                    {line.cookingNote && (
                      <p className="text-[10px] text-amber-300 font-medium">({line.cookingNote})</p>
                    )}
                  </div>
                  <span className="font-bold text-neutral-200">{formatCurrency(line.unitPrice * line.quantity)}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center px-1 mb-4 text-xs font-bold text-neutral-300">
              <span>Total Payable Amount</span>
              <span className="text-sm font-extrabold text-white">{formatCurrency(cartTotal)}</span>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 h-11 rounded-xl border border-neutral-700 bg-neutral-800 text-xs font-bold text-neutral-300 hover:bg-neutral-700 transition"
              >
                Modify
              </button>
              <button
                type="button"
                disabled={placeOrder.isPending}
                onClick={() => placeOrder.mutate()}
                className="flex-[2] h-11 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 text-xs font-black uppercase text-white shadow-lg shadow-rose-600/40 hover:brightness-110 active:scale-95 transition disabled:opacity-50"
              >
                {placeOrder.isPending ? "Placing..." : "Confirm & Place Order"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
