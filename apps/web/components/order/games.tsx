"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Play, RotateCcw, Trophy, Sparkles, Clock, Flame, Users, User, Gamepad2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GameSettings {
  memoryEnabled: boolean;
  snacksEnabled: boolean;
  memoryImages?: string[];
  catchImages?: string[];
  avoidImages?: string[];
}

export function getStoredGameSettings(branchId: string | null): GameSettings {
  if (typeof window === "undefined" || !branchId) {
    return { memoryEnabled: true, snacksEnabled: true };
  }
  try {
    const raw = localStorage.getItem(`easydine_games_settings_${branchId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { memoryEnabled: true, snacksEnabled: true };
}

interface GamesProps {
  restaurantName?: string;
  restaurantLogoUrl?: string | null;
  onClose: () => void;
  isOrderPaid?: boolean;
  settings?: GameSettings;
}

// 12 distinct mouth-watering dishes for Food Memory (pairs = 24 cards)
const DEFAULT_MEMORY_DISHES = [
  { id: "pizza", name: "Pizza", emoji: "🍕", bg: "bg-red-500/10 text-red-600 border-red-500/20" },
  { id: "burger", name: "Burger", emoji: "🍔", bg: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  { id: "samosa", name: "Samosa", emoji: "🥟", bg: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
  { id: "biryani", name: "Biryani", emoji: "🍛", bg: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  { id: "paneer", name: "Paneer Tikka", emoji: "🍢", bg: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  { id: "dosa", name: "Dosa", emoji: "🥞", bg: "bg-lime-500/10 text-lime-600 border-lime-500/20" },
  { id: "icecream", name: "Sundae", emoji: "🍨", bg: "bg-pink-500/10 text-pink-600 border-pink-500/20" },
  { id: "noodles", name: "Noodles", emoji: "🍜", bg: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
  { id: "taco", name: "Taco", emoji: "🌮", bg: "bg-amber-600/10 text-amber-700 border-amber-600/20" },
  { id: "fries", name: "Fries", emoji: "🍟", bg: "bg-yellow-400/10 text-yellow-500 border-yellow-400/20" },
  { id: "cake", name: "Pastry", emoji: "🍰", bg: "bg-rose-500/10 text-rose-600 border-rose-500/20" },
  { id: "drink", name: "Cool Drink", emoji: "🥤", bg: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
];

const DEFAULT_SNACKS = [
  { name: "Burger", emoji: "🍔" },
  { name: "Pizza", emoji: "🍕" },
  { name: "Fries", emoji: "🍟" },
  { name: "Samosa", emoji: "🥟" },
  { name: "Ice Cream", emoji: "🍦" },
  { name: "Taco", emoji: "🌮" },
  { name: "Donut", emoji: "🍩" },
];

const DEFAULT_BURNT = [
  { name: "Burnt Toast", emoji: "🍞🔥" },
  { name: "Burnt Meat", emoji: "🥩💀" },
  { name: "Burnt Chilli", emoji: "🌶️💣" },
];

// Shuffle helper
function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function GamesDialog({
  restaurantName = "EasyDine",
  restaurantLogoUrl,
  onClose,
  isOrderPaid = false,
  settings,
}: GamesProps) {
  // If order gets marked paid, immediately close and lock games
  useEffect(() => {
    if (isOrderPaid) {
      onClose();
    }
  }, [isOrderPaid, onClose]);

  const memoryEnabled = settings?.memoryEnabled !== false;
  const snacksEnabled = settings?.snacksEnabled !== false;

  const [activeTab, setActiveTab] = useState<"memory" | "snacks">(() => {
    if (!memoryEnabled && snacksEnabled) return "snacks";
    return "memory";
  });

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background/95 backdrop-blur-lg text-foreground overflow-hidden select-none touch-manipulation">
      {/* Top Banner / Navigation */}
      <div className="flex items-center justify-between border-b border-border/80 bg-card/90 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex items-center gap-3">
          {restaurantLogoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={restaurantLogoUrl} alt={restaurantName} className="h-9 w-9 rounded-xl object-cover shadow-sm border border-border" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white shadow-sm font-black text-sm">
              🎮
            </div>
          )}
          <div>
            <h2 className="text-sm font-black text-foreground flex items-center gap-1.5 leading-tight">
              <span>{restaurantName} Arcade</span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                Table Fun
              </span>
            </h2>
            <p className="text-[11px] text-muted-foreground font-medium">While your food is being freshly prepared</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="flex items-center gap-1 rounded-xl bg-secondary/80 hover:bg-secondary px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-all"
        >
          <X className="h-4 w-4" />
          <span>Close</span>
        </button>
      </div>

      {/* Tabs */}
      {memoryEnabled && snacksEnabled && (
        <div className="flex justify-center border-b border-border bg-card/60 p-2 gap-2">
          <button
            onClick={() => setActiveTab("memory")}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-all",
              activeTab === "memory"
                ? "bg-amber-500 text-white shadow-md shadow-amber-500/20 scale-[1.02]"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            )}
          >
            <span>🃏 Food Memory (4×6)</span>
          </button>
          <button
            onClick={() => setActiveTab("snacks")}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-all",
              activeTab === "snacks"
                ? "bg-orange-500 text-white shadow-md shadow-orange-500/20 scale-[1.02]"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            )}
          >
            <span>🍕 Catch the Snacks</span>
          </button>
        </div>
      )}

      {/* Active Game Container */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-5 flex flex-col items-center justify-center">
        {activeTab === "memory" && memoryEnabled && <FoodMemoryGame customImages={settings?.memoryImages} />}
        {activeTab === "snacks" && snacksEnabled && <CatchSnacksGame settings={settings} />}
      </div>
    </div>
  );
}

/* =========================================================================
   1. FOOD MEMORY GAME (24 Cards, 12 Pairs, 4x6 on Mobile)
   ========================================================================= */
interface MemoryCard {
  id: number;
  pairId: number;
  name: string;
  emoji: string;
  image?: string;
  bg: string;
  isFlipped: boolean;
  isMatched: boolean;
}

function FoodMemoryGame({ customImages }: { customImages?: string[] }) {
  const [mode, setMode] = useState<"single" | "two_player">("single");
  const [cards, setCards] = useState<MemoryCard[]>([]);
  const [flippedIds, setFlippedIds] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [matchedPairsCount, setMatchedPairsCount] = useState(0);

  // 2-player state
  const [activePlayer, setActivePlayer] = useState<1 | 2>(1);
  const [p1Matches, setP1Matches] = useState(0);
  const [p2Matches, setP2Matches] = useState(0);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Initialize or restart board
  const startNewGame = useCallback(() => {
    // 12 distinct dishes
    const distinct12 = DEFAULT_MEMORY_DISHES.map((dish, i) => {
      const customImg = customImages && customImages[i];
      return {
        ...dish,
        image: customImg || undefined,
      };
    });

    // 24 cards (2 of each)
    const cardPool: MemoryCard[] = [];
    let uid = 0;
    distinct12.forEach((dish, pairIdx) => {
      cardPool.push({
        id: uid++,
        pairId: pairIdx,
        name: dish.name,
        emoji: dish.emoji,
        image: dish.image,
        bg: dish.bg,
        isFlipped: false,
        isMatched: false,
      });
      cardPool.push({
        id: uid++,
        pairId: pairIdx,
        name: dish.name,
        emoji: dish.emoji,
        image: dish.image,
        bg: dish.bg,
        isFlipped: false,
        isMatched: false,
      });
    });

    setCards(shuffle(cardPool));
    setFlippedIds([]);
    setMoves(0);
    setTimerSeconds(0);
    setMatchedPairsCount(0);
    setActivePlayer(1);
    setP1Matches(0);
    setP2Matches(0);
    setIsLocked(false);
    setFeedbackMsg(null);
    setIsPlaying(true);
  }, [customImages]);

  // Initial deal
  useEffect(() => {
    startNewGame();
  }, [startNewGame]);

  // Timer loop
  useEffect(() => {
    if (!isPlaying || matchedPairsCount === 12) return;
    const interval = setInterval(() => {
      setTimerSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, matchedPairsCount]);

  // Handle card click
  const handleCardClick = (card: MemoryCard) => {
    if (isLocked || card.isFlipped || card.isMatched || !isPlaying) return;
    if (flippedIds.length >= 2) return;

    // Flip card
    const nextFlippedIds = [...flippedIds, card.id];
    setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, isFlipped: true } : c)));
    setFlippedIds(nextFlippedIds);

    if (nextFlippedIds.length === 2) {
      setMoves((m) => m + 1);
      setIsLocked(true);

      const firstCard = cards.find((c) => c.id === nextFlippedIds[0])!;
      const secondCard = card;

      if (firstCard.pairId === secondCard.pairId) {
        // MATCH!
        setTimeout(() => {
          setCards((prev) =>
            prev.map((c) =>
              c.id === firstCard.id || c.id === secondCard.id
                ? { ...c, isMatched: true, isFlipped: true }
                : c
            )
          );
          setFlippedIds([]);
          setIsLocked(false);
          setMatchedPairsCount((prev) => prev + 1);

          if (mode === "two_player") {
            if (activePlayer === 1) setP1Matches((p) => p + 1);
            else setP2Matches((p) => p + 1);
            setFeedbackMsg(`Match! Player ${activePlayer} goes again! ✨`);
            setTimeout(() => setFeedbackMsg(null), 1200);
          }
        }, 500);
      } else {
        // MISMATCH - reveal then flip back, no hints!
        setTimeout(() => {
          setCards((prev) =>
            prev.map((c) =>
              c.id === firstCard.id || c.id === secondCard.id ? { ...c, isFlipped: false } : c
            )
          );
          setFlippedIds([]);
          setIsLocked(false);

          if (mode === "two_player") {
            const nextP = activePlayer === 1 ? 2 : 1;
            setActivePlayer(nextP);
            setFeedbackMsg(`Mismatch! Player ${nextP}'s turn 🔄`);
            setTimeout(() => setFeedbackMsg(null), 1200);
          }
        }, 850);
      }
    }
  };

  const isGameOver = matchedPairsCount === 12;

  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto">
      {/* Mode Selection & Stats Header */}
      <div className="flex w-full items-center justify-between gap-2 mb-3 bg-card/80 p-2.5 rounded-2xl border border-border shadow-sm">
        <div className="flex items-center gap-1.5 bg-secondary/80 p-1 rounded-xl">
          <button
            onClick={() => {
              setMode("single");
              startNewGame();
            }}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all",
              mode === "single" ? "bg-amber-500 text-white shadow" : "text-muted-foreground"
            )}
          >
            <User className="h-3.5 w-3.5" />
            <span>1P</span>
          </button>
          <button
            onClick={() => {
              setMode("two_player");
              startNewGame();
            }}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all",
              mode === "two_player" ? "bg-amber-500 text-white shadow" : "text-muted-foreground"
            )}
          >
            <Users className="h-3.5 w-3.5" />
            <span>2P (Same Phone)</span>
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs font-bold">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-amber-500" />
            {Math.floor(timerSeconds / 60)}:{(timerSeconds % 60).toString().padStart(2, "0")}
          </span>
          <span className="text-muted-foreground">
            {moves} Moves
          </span>
          <button
            onClick={startNewGame}
            title="Restart"
            className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground transition-all"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 2-Player Status Bar */}
      {mode === "two_player" && (
        <div className="w-full flex items-center justify-between px-3 py-1.5 mb-2.5 rounded-xl border border-border bg-card/60 text-xs font-bold">
          <div className={cn("px-2.5 py-0.5 rounded-lg transition-all", activePlayer === 1 ? "bg-blue-500 text-white shadow" : "text-muted-foreground")}>
            Player 1: {p1Matches} pairs
          </div>
          <div className="text-[11px] text-amber-500 font-extrabold animate-pulse">
            {feedbackMsg || `Player ${activePlayer}'s Turn`}
          </div>
          <div className={cn("px-2.5 py-0.5 rounded-lg transition-all", activePlayer === 2 ? "bg-purple-500 text-white shadow" : "text-muted-foreground")}>
            Player 2: {p2Matches} pairs
          </div>
        </div>
      )}

      {/* 4x6 Grid of Cards (24 cards total) */}
      <div className="grid grid-cols-4 gap-2 w-full aspect-[4/6] max-h-[68vh]">
        {cards.map((card) => {
          const isOpen = card.isFlipped || card.isMatched;
          return (
            <button
              key={card.id}
              type="button"
              disabled={isLocked || card.isMatched}
              onClick={() => handleCardClick(card)}
              className={cn(
                "relative flex items-center justify-center rounded-xl p-1 font-bold text-center transition-all duration-300 transform perspective-1000",
                isOpen
                  ? cn(card.bg, "shadow-md scale-[0.98] border")
                  : "bg-gradient-to-br from-amber-600 to-orange-500 text-white hover:brightness-110 shadow-sm active:scale-95 border border-amber-400/30",
                card.isMatched && "opacity-80 ring-2 ring-emerald-500 ring-offset-1 bg-emerald-500/10"
              )}
            >
              {isOpen ? (
                <div className="flex flex-col items-center justify-center w-full h-full select-none animate-in zoom-in-75 duration-200">
                  {card.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={card.image} alt={card.name} className="w-8 h-8 rounded-lg object-cover mb-0.5" />
                  ) : (
                    <span className="text-2xl sm:text-3xl leading-none">{card.emoji}</span>
                  )}
                  <span className="text-[9px] sm:text-[10px] font-extrabold truncate max-w-full leading-tight mt-0.5">
                    {card.name}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-white/90">
                  <span className="text-xl sm:text-2xl opacity-90 drop-shadow">🍽️</span>
                  <span className="text-[9px] font-black uppercase tracking-wider text-amber-100">Tap</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Game Over Celebration Modal */}
      {isGameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-full max-w-xs rounded-3xl border border-amber-500/30 bg-card p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 mb-3">
              <Trophy className="h-8 w-8 text-amber-500 animate-bounce" />
            </div>
            <h3 className="text-lg font-black text-foreground">Feast Memory Master!</h3>
            
            {mode === "single" ? (
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                You matched all 12 food pairs in <strong className="text-foreground">{moves} moves</strong> and{" "}
                <strong className="text-foreground">{timerSeconds} seconds</strong>!
              </p>
            ) : (
              <div className="mt-2 text-xs">
                <p className="font-extrabold text-base text-amber-500 mb-1">
                  {p1Matches > p2Matches
                    ? "🎉 Player 1 Wins!"
                    : p2Matches > p1Matches
                    ? "🎉 Player 2 Wins!"
                    : "🤝 It's a Tie!"}
                </p>
                <p className="text-muted-foreground">
                  Player 1: {p1Matches} pairs · Player 2: {p2Matches} pairs
                </p>
              </div>
            )}

            <button
              onClick={startNewGame}
              className="mt-5 w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 text-xs font-black text-white shadow-lg shadow-orange-500/20 hover:brightness-105 active:scale-95 transition-all"
            >
              Play Another Round 🔄
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   2. CATCH THE SNACKS GAME
   (Smooth falling snacks with ref-backed loop, 30s rounds, avoid burnt food)
   ========================================================================= */
interface FallingItem {
  id: number;
  x: number; // 5% to 85%
  y: number; // 0% to 105%
  speed: number; // % height per frame
  type: "snack" | "burnt";
  emoji: string;
  name: string;
  image?: string;
}

function CatchSnacksGame({ settings }: { settings?: GameSettings }) {
  const [mode, setMode] = useState<"single" | "two_player">("single");
  const [roundPlayer, setRoundPlayer] = useState<1 | 2>(1);
  const [phase, setPhase] = useState<"ready" | "playing" | "between_players" | "game_over">("ready");

  const [score, setScore] = useState(0);
  const [p1Score, setP1Score] = useState(0);
  const [p2Score, setP2Score] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);

  // Synchronized state for rendering falling items on screen
  const [renderedItems, setRenderedItems] = useState<FallingItem[]>([]);
  const [scorePopups, setScorePopups] = useState<{ id: number; text: string; x: number; y: number; color: string }[]>([]);

  // Ref tracking
  const itemsRef = useRef<FallingItem[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const nextIdRef = useRef(1);
  const spawnTimerRef = useRef(0);
  const isPlayingRef = useRef(false);
  const tappedIdsRef = useRef<Set<number>>(new Set());

  // Custom or default assets
  const snackList = settings?.catchImages?.length
    ? settings.catchImages.map((img, i) => ({ name: `Snack ${i + 1}`, emoji: "🍕", image: img }))
    : DEFAULT_SNACKS;
  const burntList = settings?.avoidImages?.length
    ? settings.avoidImages.map((img, i) => ({ name: `Burnt ${i + 1}`, emoji: "🔥", image: img }))
    : DEFAULT_BURNT;

  // Start round
  const startRound = (player: 1 | 2 = 1) => {
    setRoundPlayer(player);
    setScore(0);
    setTimeLeft(30);
    itemsRef.current = [];
    tappedIdsRef.current.clear();
    setRenderedItems([]);
    setScorePopups([]);
    isPlayingRef.current = true;
    setPhase("playing");
  };

  // Timer countdown (30s)
  useEffect(() => {
    if (phase !== "playing") return;
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(interval);
          handleRoundEnd();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, roundPlayer, mode, score]);

  const handleRoundEnd = () => {
    isPlayingRef.current = false;
    if (mode === "single") {
      setPhase("game_over");
    } else {
      if (roundPlayer === 1) {
        setP1Score(score);
        setPhase("between_players");
      } else {
        setP2Score(score);
        setPhase("game_over");
      }
    }
  };

  // Main 60fps Animation Loop: moves falling items down screen
  useEffect(() => {
    if (phase !== "playing") {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    let lastTick = performance.now();

    const loop = (now: number) => {
      const dt = (now - lastTick) / 1000;
      lastTick = now;

      // Spawn item every ~0.65s
      spawnTimerRef.current += dt;
      if (spawnTimerRef.current > 0.65) {
        spawnTimerRef.current = 0;
        const isBurnt = Math.random() < 0.28; // ~28% chance burnt item
        const candidate = isBurnt
          ? burntList[Math.floor(Math.random() * burntList.length)]
          : snackList[Math.floor(Math.random() * snackList.length)];

        itemsRef.current.push({
          id: nextIdRef.current++,
          x: Math.floor(Math.random() * 80) + 10, // 10% to 90%
          y: -10,
          speed: Math.random() * 15 + 30, // 30% to 45% of height per sec
          type: isBurnt ? "burnt" : "snack",
          emoji: candidate.emoji,
          name: candidate.name,
          image: (candidate as any).image,
        });
      }

      // Update positions
      const nextItems: FallingItem[] = [];
      for (const item of itemsRef.current) {
        const nextY = item.y + item.speed * dt;
        if (nextY <= 105) {
          nextItems.push({ ...item, y: nextY });
        }
      }
      itemsRef.current = nextItems;
      setRenderedItems([...nextItems]);

      if (isPlayingRef.current) {
        animFrameRef.current = requestAnimationFrame(loop);
      }
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [phase, burntList, snackList]);

  // Tap handler on falling item
  const handleItemTap = (item: FallingItem, e?: React.SyntheticEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (tappedIdsRef.current.has(item.id)) return;
    tappedIdsRef.current.add(item.id);

    // Remove from ref immediately
    itemsRef.current = itemsRef.current.filter((i) => i.id !== item.id);
    setRenderedItems([...itemsRef.current]);

    if (item.type === "snack") {
      setScore((s) => s + 10);
      addScorePopup("+10", item.x, item.y, "text-emerald-500");
    } else {
      setScore((s) => Math.max(0, s - 15));
      addScorePopup("-15 🔥", item.x, item.y, "text-rose-500");
    }
  };

  const addScorePopup = (text: string, x: number, y: number, color: string) => {
    const popId = Date.now() + Math.random();
    setScorePopups((prev) => [...prev, { id: popId, text, x, y, color }]);
    setTimeout(() => {
      setScorePopups((prev) => prev.filter((p) => p.id !== popId));
    }, 700);
  };

  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto">
      {/* Mode Header */}
      <div className="flex w-full items-center justify-between gap-2 mb-3 bg-card/80 p-2.5 rounded-2xl border border-border shadow-sm">
        <div className="flex items-center gap-1.5 bg-secondary/80 p-1 rounded-xl">
          <button
            onClick={() => {
              setMode("single");
              setPhase("ready");
            }}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all",
              mode === "single" ? "bg-orange-500 text-white shadow" : "text-muted-foreground"
            )}
          >
            <User className="h-3.5 w-3.5" />
            <span>1P</span>
          </button>
          <button
            onClick={() => {
              setMode("two_player");
              setPhase("ready");
            }}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all",
              mode === "two_player" ? "bg-orange-500 text-white shadow" : "text-muted-foreground"
            )}
          >
            <Users className="h-3.5 w-3.5" />
            <span>2P (Alternating)</span>
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs font-bold">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-orange-500" />
            {timeLeft}s
          </span>
          <span className="font-extrabold text-foreground text-sm">
            {score} pts
          </span>
        </div>
      </div>

      {mode === "two_player" && (
        <div className="w-full flex items-center justify-between px-3 py-1.5 mb-2 rounded-xl border border-border bg-card/60 text-xs font-bold">
          <span className={cn(roundPlayer === 1 && phase === "playing" ? "text-orange-500 underline" : "text-muted-foreground")}>
            P1 Score: {roundPlayer === 1 ? score : p1Score}
          </span>
          <span className="text-[11px] font-extrabold uppercase text-amber-500">
            {phase === "playing" ? `Player ${roundPlayer}'s Turn` : "Pass & Play"}
          </span>
          <span className={cn(roundPlayer === 2 && phase === "playing" ? "text-orange-500 underline" : "text-muted-foreground")}>
            P2 Score: {roundPlayer === 2 ? score : p2Score}
          </span>
        </div>
      )}

      {/* Main Game Stage */}
      <div className="relative w-full h-[52vh] sm:h-[420px] rounded-3xl overflow-hidden border-2 border-orange-500/30 bg-gradient-to-b from-orange-500/5 via-amber-500/10 to-orange-500/15 shadow-inner select-none touch-manipulation">
        {/* Falling items */}
        {renderedItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onPointerDown={(e) => handleItemTap(item, e)}
            onClick={(e) => handleItemTap(item, e)}
            style={{
              position: "absolute",
              left: `${item.x}%`,
              top: `${item.y}%`,
              transform: "translate(-50%, -50%)",
            }}
            className={cn(
              "flex flex-col items-center justify-center p-2 rounded-2xl shadow-lg border transition-transform active:scale-125 cursor-pointer touch-manipulation",
              item.type === "snack"
                ? "bg-amber-400/90 border-amber-300 shadow-amber-500/30 text-white animate-bounce"
                : "bg-neutral-900/90 border-neutral-700 shadow-red-500/30 text-rose-400 animate-pulse"
            )}
          >
            {item.image ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={item.image} alt={item.name} className="w-10 h-10 object-contain drop-shadow" />
            ) : (
              <span className="text-3xl leading-none">{item.emoji}</span>
            )}
          </button>
        ))}

        {/* Floating Tap Popups */}
        {scorePopups.map((p) => (
          <span
            key={p.id}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 text-sm font-black pointer-events-none drop-shadow-md animate-out fade-out slide-out-to-top-4 duration-500",
              p.color
            )}
          >
            {p.text}
          </span>
        ))}

        {/* Ready Overlay */}
        {phase === "ready" && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm p-4 text-center">
            <span className="text-4xl mb-2">🍕 ⚡ 🍔</span>
            <h3 className="text-base font-black text-foreground">Catch the Snacks!</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-xs leading-relaxed">
              Tap tasty food for <strong className="text-emerald-500">+10 pts</strong>.<br />
              Avoid burnt food (<strong className="text-rose-500">-15 pts</strong>)!
            </p>
            <button
              onClick={() => startRound(1)}
              className="mt-4 flex items-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-3 text-xs font-black text-white shadow-lg shadow-orange-500/30 hover:brightness-105 active:scale-95 transition-all"
            >
              <Play className="h-4 w-4" />
              <span>Start 30s Game</span>
            </button>
          </div>
        )}

        {/* Between Players Screen (2P Mode) */}
        {phase === "between_players" && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/85 backdrop-blur-sm p-4 text-center">
            <Trophy className="h-10 w-10 text-amber-500 mb-2" />
            <h3 className="text-base font-black text-foreground">Player 1 scored {p1Score} pts!</h3>
            <p className="mt-1 text-xs text-muted-foreground">Hand the phone to Player 2</p>
            <button
              onClick={() => startRound(2)}
              className="mt-4 flex items-center gap-2 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-500 px-6 py-3 text-xs font-black text-white shadow-lg shadow-purple-500/30 hover:brightness-105 active:scale-95 transition-all"
            >
              <Play className="h-4 w-4" />
              <span>Start Player 2 Round (30s)</span>
            </button>
          </div>
        )}

        {/* Game Over Screen */}
        {phase === "game_over" && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/85 backdrop-blur-sm p-4 text-center">
            <Trophy className="h-12 w-12 text-orange-500 mb-2 animate-bounce" />
            <h3 className="text-lg font-black text-foreground">Round Finished!</h3>
            {mode === "single" ? (
              <p className="mt-1 text-xs text-muted-foreground">
                You scored <strong className="text-lg text-orange-500">{score}</strong> points!
              </p>
            ) : (
              <div className="mt-2 text-xs">
                <p className="font-extrabold text-base text-orange-500 mb-1">
                  {p1Score > p2Score
                    ? "🎉 Player 1 Wins!"
                    : p2Score > p1Score
                    ? "🎉 Player 2 Wins!"
                    : "🤝 It's a Tie!"}
                </p>
                <p className="text-muted-foreground">
                  Player 1: {p1Score} pts · Player 2: {p2Score} pts
                </p>
              </div>
            )}
            <button
              onClick={() => startRound(1)}
              className="mt-5 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-3 text-xs font-black text-white shadow-lg shadow-orange-500/30 hover:brightness-105 active:scale-95 transition-all"
            >
              Play Again 🔄
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
