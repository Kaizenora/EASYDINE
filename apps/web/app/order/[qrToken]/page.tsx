"use client";

import {
  ArrowLeft,
  BellRing,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  Flame,
  Info,
  Leaf,
  MapPin,
  Mic,
  MicOff,
  Minus,
  PenTool,
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
    items: { id: string; nameSnapshot: string; quantity: number; status: string; kitchenNote?: string }[];
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
  categories: PublicMenuCategory[];
}

export default function LuxuryCustomerMenu({
  params,
}: {
  params: Promise<{ qrToken: string }>;
}) {
  const { qrToken } = use(params);
  const nameStorageKey = `qr-guest-name:${qrToken}`;
  const queryClient = useQueryClient();

  // Customer identity
  const [guestName, setGuestName] = useState("");
  const [nameDraft, setNameDraft] = useState("Sid");

  // Cart
  const [cart, setCart] = useState<CartLine[]>([]);
  const [placed, setPlaced] = useState<{ orderNumber: string } | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [dietFilter, setDietFilter] = useState<"ALL" | "VEG" | "POPULAR" | "SPICY" | "BREADS">("ALL");

  // Modals
  const [customizingItem, setCustomizingItem] = useState<{ item: PublicMenuItem; categoryName: string } | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [extraCheese, setExtraCheese] = useState(false);
  const [cookingNote, setCookingNote] = useState("");
  const [customizingQty, setCustomizingQty] = useState(1);
  const [isListeningSearchMic, setIsListeningSearchMic] = useState(false);
  const [isListeningCustomMic, setIsListeningCustomMic] = useState(false);
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [showCartDrawer, setShowCartDrawer] = useState(false);
  const [showWaiterModal, setShowWaiterModal] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);
  const [waiterCalledNotice, setWaiterCalledNotice] = useState(false);
  const [billRequestedNotice, setBillRequestedNotice] = useState(false);

  // Load customer credentials
  useEffect(() => {
    const savedName = sessionStorage.getItem(nameStorageKey);
    if (savedName) {
      setGuestName(savedName);
      setNameDraft(savedName);
    }
  }, [nameStorageKey]);

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
    retry: 1,
  });

  // Live order status & pending call requests
  const { data: status } = useQuery({
    queryKey: ["public-status", qrToken],
    queryFn: () => api.get<PublicStatus>(`/public/menu/${qrToken}/status`),
    refetchInterval: 4000,
    enabled: !!data,
  });

  // Reset waiter button availability once cashier acknowledges
  useEffect(() => {
    if (status?.waiterAcknowledged) {
      setWaiterCalledNotice(false);
    }
  }, [status?.waiterAcknowledged]);

  // Call Waiter / Request Bill
  const requestService = useMutation({
    mutationFn: (type: "WAITER" | "BILL") => api.post(`/public/menu/${qrToken}/request`, { type }),
    onSuccess: (_, type) => {
      queryClient.invalidateQueries({ queryKey: ["public-status", qrToken] });
      if (type === "WAITER") {
        setWaiterCalledNotice(true);
        setShowWaiterModal(false);
        toast.success("Waiter called! A server will attend to your table shortly.");
      } else {
        setBillRequestedNotice(true);
        setShowBillModal(false);
        toast.success("Bill requested! Cashier has been notified.");
      }
    },
    onError: () => toast.error("Could not send request. Please try again or wave to staff."),
  });

  // Place Order Mutation
  const placeOrder = useMutation({
    mutationFn: () =>
      api.post<{ orderNumber: string }>(`/public/menu/${qrToken}/order`, {
        guestName: guestName || "Sid",
        items: cart.map((c) => ({
          menuItemId: c.menuItemId,
          quantity: c.quantity,
          kitchenNote: [c.modifierLabel, c.cookingNote].filter(Boolean).join(" · ") || undefined,
        })),
      }),
    onSuccess: (res) => {
      setPlaced(res);
      setCart([]);
      setShowCartDrawer(false);
      queryClient.invalidateQueries({ queryKey: ["public-status", qrToken] });
      toast.success(`Order #${res.orderNumber} placed! Waiting for cashier approval.`);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not place order. Please try again."),
  });

  // Check-in action
  const confirmCheckIn = () => {
    const finalName = nameDraft.trim() || "Sid";
    setGuestName(finalName);
    sessionStorage.setItem(nameStorageKey, finalName);
    api.post(`/public/menu/${qrToken}/check-in`, { guestName: finalName }).catch(() => {});
  };

  // Cart helper calculations
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

  // ==========================================
  // WORKING AUDIO / SPEECH RECOGNITION
  // ==========================================
  const triggerAudioVoiceInput = (target: "search" | "cooking") => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.info("Voice recognition initializing... Speak your order request.");
      // Fallback: prompt for user speech text
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

      recognition.onerror = (e: any) => {
        setIsListeningSearchMic(false);
        setIsListeningCustomMic(false);
        if (e.error === "not-allowed") {
          toast.error("Microphone access denied. Please allow microphone in browser.");
        } else {
          toast.info("Voice input ended. You can also type directly.");
        }
      };

      recognition.onend = () => {
        setIsListeningSearchMic(false);
        setIsListeningCustomMic(false);
      };

      recognition.start();
    } catch (err) {
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

  // Error screen
  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#FAF8F5] px-6 text-center text-neutral-900">
        <UtensilsCrossed className="h-12 w-12 text-[#B97A1C]" />
        <h2 className="text-xl font-bold">Connecting to Table...</h2>
        <p className="text-sm text-neutral-500">
          Loading Hotel Sanjog live dining session for {qrToken}...
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-xl bg-[#C68A28] px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-[#B97A1C]"
        >
          Retry
        </button>
      </div>
    );
  }

  // 1. WELCOME SCREEN (Image 4 match: media_1794121934287_80449d1d.jpg)
  if (!guestName) {
    return (
      <div className="relative flex min-h-screen flex-col justify-between bg-[#F7F5F0] px-6 py-10 font-sans text-neutral-900">
        <div className="flex flex-col gap-6">
          {/* Top header */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-[#A06C18]">
              <span className="h-2 w-2 rounded-full bg-[#B97A1C]" />
              <span>QR SCANNED · DINE-IN</span>
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[#1E1B18]">
              {data?.branchName || "Hotel Sanjog"}
            </h1>
            <p className="mt-1 text-sm font-medium text-neutral-500">
              Ahmednagar · North Indian & Maharashtrian
            </p>
          </div>

          {/* 3 Food Photos side-by-side with rounded borders */}
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

          {/* Floating Card with warm soft gold gradient */}
          <div className="rounded-3xl border border-amber-200/60 bg-gradient-to-b from-[#F2EBDC] to-[#E9DFCB] p-6 shadow-sm">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-700/30 bg-amber-500/10 px-3.5 py-1 text-xs font-bold text-amber-900">
              <span>🪑 {data?.tableName || "Table 12"}</span>
            </div>

            <div className="mt-5">
              <label htmlFor="name-input" className="text-xs font-black uppercase tracking-wider text-neutral-600">
                YOUR NAME
              </label>
              <input
                id="name-input"
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Enter your name"
                className="mt-2 w-full rounded-2xl border border-neutral-300/80 bg-[#E6DFD1]/80 px-4 py-3.5 text-base font-bold text-neutral-900 placeholder:text-neutral-500 focus:border-amber-600 focus:outline-none"
              />
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
      </div>
    );
  }

  // 2. MAIN MENU SCREEN (Image 5 match: media_1794121940638_549b9a25.jpg)
  const hasActiveOrder = Boolean(status?.order && status.order.status !== "CANCELLED");

  return (
    <div className="relative min-h-screen bg-[#FAF8F5] pb-32 font-sans text-neutral-900">
      {/* Top Header (Image 5 match) */}
      <header className="sticky top-0 z-30 border-b border-[#EAE5DD] bg-[#FAF8F5]/95 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black tracking-tight text-[#1E1B18]">
              {data?.branchName || "Hotel Sanjog"}
            </h1>
            <div className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-[#EAE5DD] px-3 py-0.5 text-xs font-semibold text-[#5C554D]">
              <span>{data?.tableName || "Table 12"}</span>
              <span>·</span>
              <span>{guestName}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowWaiterModal(true)}
              className="flex items-center gap-1.5 rounded-full bg-[#C68A28] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#B97A1C] transition-all"
            >
              <Phone className="h-3.5 w-3.5" />
              Call waiter
            </button>
          </div>
        </div>

        {/* Search bar with voice mic */}
        <div className="relative mt-3">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder='Search "paneer"'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 w-full rounded-full border border-[#E0DAD0] bg-[#ECE7DF] pl-10 pr-10 text-xs font-medium text-neutral-800 placeholder-neutral-500 focus:border-[#C68A28] focus:bg-white focus:outline-none transition-all"
          />
          <button
            type="button"
            onClick={() => triggerAudioVoiceInput("search")}
            className={cn(
              "absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full transition-all",
              isListeningSearchMic ? "text-red-500 animate-pulse bg-red-100" : "text-neutral-500 hover:text-[#C68A28]"
            )}
            title="Search with voice"
          >
            <Mic className="h-4 w-4" />
          </button>
        </div>

        {/* Filter chips: [🟢 Veg], Popular, Spicy, Breads (Image 5 match) */}
        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 text-xs scrollbar-none">
          <button
            onClick={() => setDietFilter(dietFilter === "VEG" ? "ALL" : "VEG")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-bold transition-all border",
              dietFilter === "VEG"
                ? "border-[#82B87A] bg-[#EBF5E9] text-[#2E6826] shadow-sm"
                : "border-[#E0DAD0] bg-[#ECE7DF] text-[#5C554D] hover:bg-white"
            )}
          >
            <span className="flex h-3 w-3 items-center justify-center rounded-[2px] border border-[#2E6826] p-[1.5px]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#2E6826]" />
            </span>
            Veg
          </button>

          <button
            onClick={() => setDietFilter(dietFilter === "POPULAR" ? "ALL" : "POPULAR")}
            className={cn(
              "rounded-full px-3.5 py-1.5 font-bold transition-all border",
              dietFilter === "POPULAR"
                ? "border-[#C68A28] bg-[#F7EEDC] text-[#915F15] shadow-sm"
                : "border-[#E0DAD0] bg-[#ECE7DF] text-[#5C554D] hover:bg-white"
            )}
          >
            Popular
          </button>

          <button
            onClick={() => setDietFilter(dietFilter === "SPICY" ? "ALL" : "SPICY")}
            className={cn(
              "rounded-full px-3.5 py-1.5 font-bold transition-all border",
              dietFilter === "SPICY"
                ? "border-[#C68A28] bg-[#F7EEDC] text-[#915F15] shadow-sm"
                : "border-[#E0DAD0] bg-[#ECE7DF] text-[#5C554D] hover:bg-white"
            )}
          >
            Spicy
          </button>

          <button
            onClick={() => setDietFilter(dietFilter === "BREADS" ? "ALL" : "BREADS")}
            className={cn(
              "rounded-full px-3.5 py-1.5 font-bold transition-all border",
              dietFilter === "BREADS"
                ? "border-[#C68A28] bg-[#F7EEDC] text-[#915F15] shadow-sm"
                : "border-[#E0DAD0] bg-[#ECE7DF] text-[#5C554D] hover:bg-white"
            )}
          >
            Breads
          </button>
        </div>
      </header>

      {/* Alert Notices */}
      <div className="flex flex-col gap-2 px-4 pt-3">
        {waiterCalledNotice && (
          <div className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 shadow-sm">
            <div className="flex items-center gap-2">
              <BellRing className="h-4 w-4 shrink-0 text-amber-600" />
              <span>Waiter notified — someone is coming to {data?.tableName || "Table 12"}.</span>
            </div>
            <button onClick={() => setWaiterCalledNotice(false)} className="text-neutral-400 hover:text-black">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {billRequestedNotice && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900 shadow-sm">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>Bill requested — cashier has been notified.</span>
            </div>
            <button onClick={() => setBillRequestedNotice(false)} className="text-neutral-400 hover:text-black">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* LIVE ORDER TRACKING CARD (When an order is placed) */}
      {hasActiveOrder && (
        <div className="mx-4 mt-3 rounded-2xl border border-amber-300 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                LIVE ORDER TRACKING
              </span>
              <p className="text-sm font-black text-neutral-900">Order #{status?.order?.orderNumber || "24"}</p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
              {status?.order?.status === "PREPARING"
                ? "Cooking in Kitchen"
                : status?.order?.status === "SERVED"
                ? "Served at Table"
                : "Accepted by Cashier"}
            </span>
          </div>

          {/* Stepper */}
          <div className="my-4 flex items-center justify-between text-xs">
            <div className="flex flex-col items-center gap-1 text-center">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white font-bold">
                <Check className="h-4 w-4 stroke-[3]" />
              </div>
              <span className="text-[11px] font-bold text-emerald-700">Accepted</span>
            </div>

            <div className="h-0.5 flex-1 bg-amber-200 mx-2" />

            <div className="flex flex-col items-center gap-1 text-center">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-white font-bold",
                  status?.order?.status === "PREPARING" || status?.order?.status === "SERVED"
                    ? "bg-[#C68A28]"
                    : "bg-neutral-200 text-neutral-400"
                )}
              >
                <Clock className="h-4 w-4" />
              </div>
              <span
                className={cn(
                  "text-[11px] font-bold",
                  status?.order?.status === "PREPARING" || status?.order?.status === "SERVED"
                    ? "text-[#A06C18]"
                    : "text-neutral-400"
                )}
              >
                Cooking
              </span>
            </div>

            <div className="h-0.5 flex-1 bg-neutral-200 mx-2" />

            <div className="flex flex-col items-center gap-1 text-center">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                  status?.order?.status === "SERVED"
                    ? "bg-emerald-500 text-white"
                    : "bg-neutral-200 text-neutral-400"
                )}
              >
                ○
              </div>
              <span
                className={cn(
                  "text-[11px] font-bold",
                  status?.order?.status === "SERVED" ? "text-emerald-700" : "text-neutral-400"
                )}
              >
                Served
              </span>
            </div>
          </div>

          {/* Request Bill Button — ONLY available after food is ordered and confirmed */}
          <div className="mt-3 flex gap-2 border-t border-neutral-100 pt-3">
            <button
              onClick={() => setShowWaiterModal(true)}
              className="flex-1 rounded-xl border border-neutral-200 bg-neutral-50 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-100"
            >
              📞 Call waiter
            </button>
            <button
              onClick={() => setShowBillModal(true)}
              className="flex-1 rounded-xl bg-[#C68A28] py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#B97A1C]"
            >
              🧾 Request bill
            </button>
          </div>
        </div>
      )}

      {/* DISH SECTIONS (Image 5 match: Recommended, Main Course, etc.) */}
      <main className="px-4 py-4 space-y-6">
        {filteredCategories.map((cat) => (
          <section key={cat.id} id={`cat-${cat.id}`}>
            <div className="flex items-center justify-between pb-2">
              <h2 className="text-xl font-bold tracking-tight text-[#1E1B18]">
                {cat.name.includes("Starters") ? "Recommended" : cat.name}
              </h2>
            </div>

            <div className="divide-y divide-[#EAE5DD]">
              {cat.items.map((item) => {
                const qtyInCart = getItemQuantityInCart(item.id);
                const dishImg = getDishImage(item, cat.name);

                return (
                  <div key={item.id} className="flex items-start justify-between gap-3 py-4">
                    {/* Left: Dish Info */}
                    <div className="flex-1 pr-2">
                      <div className="flex items-center gap-2">
                        {item.isVeg ? (
                          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[2px] border border-[#2E6826] p-[1.5px]">
                            <span className="h-2 w-2 rounded-full bg-[#2E6826]" />
                          </span>
                        ) : (
                          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[2px] border border-rose-600 p-[1.5px]">
                            <span className="h-2 w-2 rounded-full bg-rose-600" />
                          </span>
                        )}
                      </div>

                      <h3 className="mt-1 text-base font-bold text-[#1E1B18] leading-snug">
                        {item.name}
                      </h3>

                      <span className="text-xs font-semibold text-[#B5791E]">
                        ― Highly reordered
                      </span>

                      <div className="mt-1 text-base font-bold text-[#1E1B18]">
                        {formatCurrency(item.price)}
                      </div>

                      {item.description && (
                        <p className="mt-1 text-xs text-[#736B63] line-clamp-2 leading-relaxed">
                          {item.description}
                        </p>
                      )}
                    </div>

                    {/* Right: Dish Photo & Stepper (Image 5 match) */}
                    <div className="relative shrink-0 flex flex-col items-center">
                      <div className="h-24 w-24 overflow-hidden rounded-2xl bg-neutral-200 shadow-sm border border-neutral-300/40">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={dishImg}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                      </div>

                      {/* Stepper with solid gold background or ADD button */}
                      <div className="-mt-3.5">
                        {qtyInCart > 0 ? (
                          <div className="flex h-8 items-center gap-3 rounded-xl bg-[#C68A28] px-3 shadow-md text-white font-black text-xs">
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
                              setCustomizingItem({ item, categoryName: cat.name });
                              setCustomizingQty(1);
                              setCookingNote("");
                              setExtraCheese(false);
                            }}
                            className="flex h-8 items-center rounded-xl bg-[#C68A28] px-4 text-xs font-bold text-white shadow-md hover:bg-[#B97A1C]"
                          >
                            ADD +
                          </button>
                        )}
                      </div>
                      <span className="mt-1 text-[10px] font-medium text-[#8A8278]">customisable</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </main>

      {/* Floating Category Menu Button (Image 5 match: [ ☰ Menu ]) */}
      <div className="fixed bottom-20 left-1/2 z-30 -translate-x-1/2">
        <button
          onClick={() => setShowCategorySheet(true)}
          className="flex items-center gap-2 rounded-full border border-neutral-300 bg-[#EAE5DD] px-4 py-2 text-xs font-bold text-[#1E1B18] shadow-lg backdrop-blur-md hover:bg-white transition-all"
        >
          <span>☰ Menu</span>
        </button>
      </div>

      {/* Sticky Bottom Bar (Image 5 match: 3 dishes · ₹620   View order >) */}
      {cartTotalDishes > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 p-4 bg-gradient-to-t from-[#FAF8F5] via-[#FAF8F5]/90 to-transparent">
          <div
            onClick={() => setShowCartDrawer(true)}
            className="flex cursor-pointer items-center justify-between rounded-2xl bg-[#B97A1C] px-5 py-4 font-bold text-white shadow-xl hover:bg-[#A06C18] transition-all"
          >
            <div className="flex flex-col">
              <span className="text-xs font-medium uppercase tracking-wider text-amber-200">
                {cartTotalDishes} {cartTotalDishes === 1 ? "dish" : "dishes"} · ₹{cartTotalPrice.toFixed(0)}
              </span>
              <span className="text-base font-black">View order</span>
            </div>

            <div className="flex items-center gap-1 text-lg font-black">
              <span>›</span>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOMISE MODAL WITH AUDIO MIC */}
      {customizingItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-neutral-200 bg-white p-5 text-neutral-900 shadow-2xl">
            <div className="flex items-start justify-between border-b border-neutral-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-neutral-900">{customizingItem.item.name}</h3>
                <p className="text-sm font-black text-[#B97A1C]">
                  {formatCurrency(customizingItem.item.price)}
                </p>
              </div>
              <button
                onClick={() => setCustomizingItem(null)}
                className="rounded-full bg-neutral-100 p-1 text-neutral-500 hover:text-black"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Cooking Request input + Audio Mic */}
            <div className="mt-4">
              <label className="text-xs font-bold text-neutral-700">Cooking request</label>
              <div className="relative mt-1.5">
                <input
                  type="text"
                  value={cookingNote}
                  onChange={(e) => setCookingNote(e.target.value)}
                  placeholder='e.g. "Extra spicy, less oil"'
                  className="w-full rounded-xl border border-neutral-300 bg-neutral-50 py-3 pl-3 pr-10 text-xs text-neutral-900 placeholder-neutral-400 focus:border-[#C68A28] focus:bg-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => triggerAudioVoiceInput("cooking")}
                  className={cn(
                    "absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full transition-all",
                    isListeningCustomMic ? "text-red-500 animate-pulse bg-red-100" : "text-neutral-500 hover:text-[#C68A28]"
                  )}
                  title="Speak cooking instructions"
                >
                  <Mic className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Add-ons */}
            <div className="mt-4 flex flex-col gap-2">
              <label className="text-xs font-bold text-neutral-700">Add-ons</label>
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs">
                <span className="font-medium text-neutral-800">Extra cheese</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#B97A1C]">+₹40</span>
                  <input
                    type="checkbox"
                    checked={extraCheese}
                    onChange={(e) => setExtraCheese(e.target.checked)}
                    className="h-4 w-4 rounded accent-[#C68A28]"
                  />
                </div>
              </label>
            </div>

            {/* Quantity Stepper & Add Button */}
            <div className="mt-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm font-bold text-neutral-800">
                <button
                  onClick={() => setCustomizingQty((q) => Math.max(1, q - 1))}
                  className="text-neutral-500 hover:text-black"
                >
                  −
                </button>
                <span>{customizingQty}</span>
                <button
                  onClick={() => setCustomizingQty((q) => q + 1)}
                  className="text-neutral-500 hover:text-black"
                >
                  +
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  const basePrice = parseFloat(customizingItem.item.price);
                  const extra = extraCheese ? 40 : 0;
                  const unitPrice = basePrice + extra;
                  const lineId = `line-${customizingItem.item.id}-${Date.now()}`;

                  setCart((prev) => [
                    ...prev,
                    {
                      id: lineId,
                      menuItemId: customizingItem.item.id,
                      name: customizingItem.item.name,
                      imageUrl: getDishImage(customizingItem.item, customizingItem.categoryName),
                      isVeg: customizingItem.item.isVeg,
                      modifierIds: extraCheese ? ["extra-cheese"] : [],
                      modifierLabel: extraCheese ? "Extra cheese (+₹40)" : "",
                      unitPrice,
                      quantity: customizingQty,
                      cookingNote: cookingNote.trim(),
                    },
                  ]);

                  toast.success(`Added ${customizingItem.item.name}`);
                  setCustomizingItem(null);
                }}
                className="flex-1 rounded-xl bg-[#C68A28] py-3 text-sm font-black text-white hover:bg-[#B97A1C] shadow-md"
              >
                Add item · ₹{((parseFloat(customizingItem.item.price) + (extraCheese ? 40 : 0)) * customizingQty).toFixed(0)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CART / YOUR ORDER DRAWER */}
      {showCartDrawer && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-neutral-200 bg-white p-5 text-neutral-900 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-bold text-neutral-900">
                Your order ({data?.tableName || "Table 12"})
              </h3>
              <button
                onClick={() => setShowCartDrawer(false)}
                className="rounded-full bg-neutral-100 p-1 text-neutral-500 hover:text-black"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Cart Items list */}
            <div className="mt-4 divide-y divide-neutral-100">
              {cart.map((line) => (
                <div key={line.id} className="flex items-start justify-between py-3">
                  <div className="flex items-start gap-3">
                    <div className="h-12 w-12 overflow-hidden rounded-xl bg-neutral-100 shrink-0 border border-neutral-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={line.imageUrl} alt="" className="h-full w-full object-cover" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-neutral-900">{line.name}</h4>
                      {line.modifierLabel && (
                        <p className="text-[11px] text-[#A06C18] font-medium">{line.modifierLabel}</p>
                      )}
                      {line.cookingNote && (
                        <p className="text-[10px] text-neutral-500">Note: &ldquo;{line.cookingNote}&rdquo;</p>
                      )}
                      <p className="mt-1 text-xs font-bold text-neutral-900">₹{line.unitPrice * line.quantity}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-bold text-neutral-800">
                    <button onClick={() => updateCartQuantity(line.id, -1)} className="px-1 text-neutral-500 hover:text-black">
                      −
                    </button>
                    <span>{line.quantity}</span>
                    <button onClick={() => updateCartQuantity(line.id, 1)} className="px-1 text-neutral-500 hover:text-black">
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowCartDrawer(false)}
              className="mt-3 text-xs font-bold text-[#A06C18] hover:underline"
            >
              + Add more items
            </button>

            <div className="mt-4 border-t border-neutral-100 pt-3">
              <div className="flex justify-between text-sm font-bold text-neutral-900">
                <span>Total amount</span>
                <span className="text-base font-black text-[#B97A1C]">₹{cartTotalPrice.toFixed(0)}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={placeOrder.isPending}
              onClick={() => placeOrder.mutate()}
              className="mt-5 flex h-13 w-full items-center justify-center rounded-2xl bg-[#C68A28] text-sm font-black text-white hover:bg-[#B97A1C] shadow-md disabled:opacity-50"
            >
              {placeOrder.isPending ? "Sending order..." : "Place order"}
            </button>
          </div>
        </div>
      )}

      {/* CATEGORIES MODAL (Image 5 match: [ ☰ Menu ]) */}
      {showCategorySheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl border border-neutral-200 bg-white p-5 text-neutral-900 shadow-2xl">
            <h3 className="text-base font-bold text-neutral-900 mb-3">Categories</h3>
            <div className="flex flex-col gap-2">
              {(data?.categories || []).map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setShowCategorySheet(false);
                    const el = document.getElementById(`cat-${cat.id}`);
                    el?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="flex items-center justify-between rounded-xl bg-neutral-50 border border-neutral-200 p-3 text-xs font-semibold text-neutral-800 hover:bg-[#FAF8F5]"
                >
                  <span>{cat.name}</span>
                  <span className="text-[#A06C18] font-bold">({cat.items.length})</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowCategorySheet(false)}
              className="mt-4 w-full rounded-xl bg-[#C68A28] py-2.5 text-xs font-bold text-white hover:bg-[#B97A1C]"
            >
              ✕ Close
            </button>
          </div>
        </div>
      )}

      {/* CALL WAITER CONFIRMATION MODAL */}
      {showWaiterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-xs rounded-2xl border border-neutral-200 bg-white p-5 text-center text-neutral-900 shadow-2xl">
            <Phone className="mx-auto h-10 w-10 text-[#C68A28] mb-2" />
            <h3 className="text-base font-bold text-neutral-900">Call Waiter?</h3>
            <p className="mt-1 text-xs text-neutral-500">
              Notify floor staff to come to {data?.tableName || "Table 12"}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowWaiterModal(false)}
                className="flex-1 rounded-xl border border-neutral-200 bg-neutral-100 py-2.5 text-xs font-bold text-neutral-600 hover:bg-neutral-200"
              >
                Cancel
              </button>
              <button
                onClick={() => requestService.mutate("WAITER")}
                className="flex-1 rounded-xl bg-[#C68A28] py-2.5 text-xs font-bold text-white hover:bg-[#B97A1C] shadow-sm"
              >
                Yes, call
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REQUEST BILL CONFIRMATION MODAL */}
      {showBillModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-xs rounded-2xl border border-neutral-200 bg-white p-5 text-center text-neutral-900 shadow-2xl">
            <Receipt className="mx-auto h-10 w-10 text-[#C68A28] mb-2" />
            <h3 className="text-base font-bold text-neutral-900">Request Bill?</h3>
            <p className="mt-1 text-xs text-neutral-500">
              Notify the cashier to prepare and bring your final bill to {data?.tableName || "Table 12"}.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowBillModal(false)}
                className="flex-1 rounded-xl border border-neutral-200 bg-neutral-100 py-2.5 text-xs font-bold text-neutral-600 hover:bg-neutral-200"
              >
                Cancel
              </button>
              <button
                onClick={() => requestService.mutate("BILL")}
                className="flex-1 rounded-xl bg-[#C68A28] py-2.5 text-xs font-bold text-white hover:bg-[#B97A1C] shadow-sm"
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
