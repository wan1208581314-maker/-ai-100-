import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { foods } from "./data/foods";
import { getCustomFoods, addCustomFood, removeCustomFood } from "./data/customFoods";
import FoodCard from "./components/FoodCard";
import Knob from "./components/Knob";
import CardWarehouse from "./components/CardWarehouse";
import CardMaker from "./components/CardMaker";
import { StatusBar, BottomActionButton } from "./components/MobileChrome";

const CARD_WIDTH = 292;
const CARD_HEIGHT = Math.round((CARD_WIDTH / 3) * 4);
const SIDE_CARD_WIDTH = 270;
const SIDE_CARD_HEIGHT = Math.round((SIDE_CARD_WIDTH / 3) * 4);
const CARD_SPACING = 218;
const STOP_DURATION_MS = 3600;

function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function easeOutQuint(t) {
  return 1 - Math.pow(1 - t, 5);
}

function FireIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 2C6.5 8 4 12 4 15a8 8 0 0016 0c0-3-2.5-7-8-13z" fill="url(#fireGrad)" stroke="#CC4400" strokeWidth="0.5" />
      <path d="M12 10c-2 3-3 5-3 6.5a3 3 0 006 0c0-1.5-1-3.5-3-6.5z" fill="#FFB347" />
      <defs>
        <linearGradient id="fireGrad" x1="12" y1="2" x2="12" y2="22">
          <stop offset="0%" stopColor="#FF6B35" />
          <stop offset="50%" stopColor="#FF4444" />
          <stop offset="100%" stopColor="#CC2200" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function App() {
  const [currentPage, setCurrentPage] = useState("home"); // home | warehouse
  const [spinCount, setSpinCount] = useState(() => {
    const saved = localStorage.getItem("spinCount");
    const savedDate = localStorage.getItem("spinCountDate");
    const today = new Date().toDateString();
    if (savedDate === today && saved) return parseInt(saved, 10);
    return 0;
  });
  const [customFoodsList, setCustomFoodsList] = useState(() => getCustomFoods());
  const [remainingCards, setRemainingCards] = useState(() => {
    const saved = localStorage.getItem("remainingCards");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        localStorage.removeItem("remainingCards");
      }
    }
    return foods.map((f) => f.id);
  });
  const [resultState, setResultState] = useState("idle");
  const [showResultText, setShowResultText] = useState(false);
  const [showMaker, setShowMaker] = useState(false);

  const allFoods = [...foods, ...customFoodsList];

  useEffect(() => {
    const allIds = [...foods.map((f) => f.id), ...customFoodsList.map((f) => f.id)];
    // The carousel list is persisted outside React, so sync it when custom cards change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRemainingCards((prev) => {
      const validPrev = prev.filter((id) => allIds.includes(id));
      const newIds = allIds.filter((id) => !validPrev.includes(id));
      const updated = [...validPrev, ...newIds];
      if (updated.length !== prev.length || updated.some((id, i) => id !== prev[i])) {
        localStorage.setItem("remainingCards", JSON.stringify(updated));
        return updated;
      }
      return prev;
    });
  }, [customFoodsList]);

  const visibleFoods = allFoods.filter((f) => remainingCards.includes(f.id));
  const len = visibleFoods.length;

  const scrollPosRef = useRef(0);
  const animFrameRef = useRef(null);
  const stateRef = useRef("idle");
  const velocityRef = useRef(0);
  const targetCardRef = useRef(0);
  const stopStartPosRef = useRef(0);
  const stopTargetPosRef = useRef(0);
  const stopStartTimeRef = useRef(0);
  const resultFoodRef = useRef(null);
  const isDraggingRef = useRef(false);
  const audioContextRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartXRef = useRef(0);
  const dragStartPosRef = useRef(0);

  const [, forceUpdate] = useState(0);
  const rerender = () => forceUpdate((n) => n + 1);

  const handleDragStart = useCallback((clientX) => {
    if (stateRef.current === "spinning" || stateRef.current === "stopping") return;
    isDraggingRef.current = true;
    setIsDragging(true);
    dragStartXRef.current = clientX;
    dragStartPosRef.current = scrollPosRef.current;
  }, []);

  const handleDragMove = useCallback((clientX) => {
    if (!isDraggingRef.current) return;
    const dx = clientX - dragStartXRef.current;
    const cardsPerPx = 1 / CARD_SPACING;
    scrollPosRef.current = dragStartPosRef.current - dx * cardsPerPx;
    rerender();
  }, []);

  const handleDragEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    const pos = scrollPosRef.current;
    const snapped = Math.round(pos);
    scrollPosRef.current = mod(snapped, len);
    rerender();
  }, [len]);

  const getVisibleCards = useCallback(() => {
    const pos = scrollPosRef.current;
    const centerIdx = Math.round(pos);
    const cards = [];
    for (let offset = -2; offset <= 2; offset++) {
      const cardIdx = ((centerIdx + offset) % len + len) % len;
      const x = (offset - (pos - centerIdx)) * CARD_SPACING;
      cards.push({ food: visibleFoods[cardIdx], x, offset, cardIdx });
    }
    return cards;
  }, [len, visibleFoods]);

  const startAnimation = useCallback(() => {
    let lastTime = performance.now();
    const loop = (now) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      if (stateRef.current === "spinning") {
        scrollPosRef.current += velocityRef.current * dt;
      } else if (stateRef.current === "stopping") {
        const elapsed = now - stopStartTimeRef.current;
        const progress = Math.min(elapsed / STOP_DURATION_MS, 1);
        const eased = easeOutQuint(progress);
        const start = stopStartPosRef.current;
        const end = stopTargetPosRef.current;
        scrollPosRef.current = start + (end - start) * eased;
        if (progress >= 1) {
          const target = targetCardRef.current;
          scrollPosRef.current = target;
          resultFoodRef.current = visibleFoods[target];
          stateRef.current = "result";
          setResultState("result");
          setShowResultText(true);
          rerender();
          setSpinCount((prev) => {
            const next = prev + 1;
            localStorage.setItem("spinCount", next.toString());
            localStorage.setItem("spinCountDate", new Date().toDateString());
            return next;
          });
          return;
        }
      } else {
        return;
      }
      rerender();
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
  }, [visibleFoods]);

  const playKnobSound = useCallback((mode) => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = audioContextRef.current || new AudioContext();
      audioContextRef.current = ctx;
      if (ctx.state === "suspended") void ctx.resume();

      const now = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.28, now + 0.012);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
      master.connect(ctx.destination);

      const tick = ctx.createOscillator();
      const tickGain = ctx.createGain();
      tick.type = "triangle";
      tick.frequency.setValueAtTime(mode === "ignite" ? 620 : 420, now);
      tick.frequency.exponentialRampToValueAtTime(180, now + 0.13);
      tickGain.gain.setValueAtTime(0.8, now);
      tickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      tick.connect(tickGain).connect(master);
      tick.start(now);
      tick.stop(now + 0.18);

      if (mode === "ignite") {
        const bufferSize = Math.floor(ctx.sampleRate * 0.28);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i += 1) {
          channel[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        const noise = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const noiseGain = ctx.createGain();
        noise.buffer = buffer;
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(850, now);
        filter.Q.setValueAtTime(0.9, now);
        noiseGain.gain.setValueAtTime(0.0001, now + 0.05);
        noiseGain.gain.exponentialRampToValueAtTime(0.35, now + 0.11);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
        noise.connect(filter).connect(noiseGain).connect(master);
        noise.start(now + 0.04);
        noise.stop(now + 0.42);
      }
    } catch {
      // Sound is a bonus interaction; keep the knob usable if audio is blocked.
    }
  }, []);

  const startSpinning = useCallback(() => {
    stateRef.current = "spinning";
    setResultState("spinning");
    setShowResultText(false);
    velocityRef.current = -14;
    startAnimation();
  }, [startAnimation]);

  const startStopping = useCallback(() => {
    if (len <= 0) return;
    stateRef.current = "stopping";
    setResultState("stopping");
    const target = Math.floor(Math.random() * len);
    const current = scrollPosRef.current;
    const currentNorm = mod(current, len);
    const distanceToTarget = mod(currentNorm - target, len);
    const minimumTravel = len * 2;
    const travel = minimumTravel + (distanceToTarget < 0.35 ? distanceToTarget + len : distanceToTarget);
    targetCardRef.current = target;
    stopStartPosRef.current = current;
    stopTargetPosRef.current = current - travel;
    stopStartTimeRef.current = performance.now();
  }, [len]);

  const handleKnobClick = useCallback(() => {
    if (stateRef.current === "spinning") {
      playKnobSound("stop");
      startStopping();
    } else if (stateRef.current === "idle" || stateRef.current === "result") {
      playKnobSound("ignite");
      startSpinning();
    }
  }, [playKnobSound, startSpinning, startStopping]);

  const handleSaveCustomFood = useCallback((newFood) => {
    const updated = addCustomFood(newFood);
    setCustomFoodsList(updated);
    setRemainingCards((prev) => {
      if (prev.includes(newFood.id)) return prev;
      const next = [...prev, newFood.id];
      localStorage.setItem("remainingCards", JSON.stringify(next));
      return next;
    });
    setShowMaker(false);
  }, []);

  const handleDeleteCustomFood = useCallback((id) => {
    const updated = removeCustomFood(id);
    setCustomFoodsList(updated);
    setRemainingCards((prev) => {
      const filtered = prev.filter((cid) => cid !== id);
      localStorage.setItem("remainingCards", JSON.stringify(filtered));
      return filtered;
    });
  }, []);

  const handleToggleCardVisibility = useCallback((id) => {
    setRemainingCards((prev) => {
      const isVisible = prev.includes(id);
      if (isVisible && prev.length <= 1) return prev;
      const next = isVisible ? prev.filter((cid) => cid !== id) : [...prev, id];
      localStorage.setItem("remainingCards", JSON.stringify(next));
      const currentCard = visibleFoods[Math.round(scrollPosRef.current) % Math.max(visibleFoods.length, 1)];
      if (isVisible && currentCard?.id === id) {
        scrollPosRef.current = 0;
        rerender();
      }
      return next;
    });
  }, [visibleFoods]);

  const handleClearHistory = useCallback(() => {
    setSpinCount(0);
    localStorage.setItem("spinCount", "0");
    localStorage.setItem("spinCountDate", new Date().toDateString());
    setShowResultText(false);
  }, []);

  useEffect(() => {
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, []);

  // The animation loop stores position in refs to avoid state updates on every pixel.
  // eslint-disable-next-line react-hooks/refs
  const cards = getVisibleCards();
  const isSpinning = resultState === "spinning";
  const isCarouselMoving = resultState === "spinning" || resultState === "stopping";
  const isResult = resultState === "result";

  return (
    <div className="app-shell flex flex-col relative overflow-hidden"
      style={{
        background:
          "radial-gradient(circle at 50% 42%, rgba(255,255,255,0.94) 0%, rgba(249,244,238,0.94) 46%, #EEE8E2 100%)",
      }}
    >
      {/* Main content area */}
      <div className="flex-1 flex flex-col items-center relative" style={{ minHeight: 0 }}>
        <AnimatePresence mode="wait">
          {currentPage === "home" ? (
            <motion.div
              key="home"
              className="w-full h-full flex flex-col items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <StatusBar />

              {/* Header */}
              <div className="w-full flex items-start justify-between shrink-0 home-header">
                <div className="w-11 h-11 rounded-full flex items-center justify-center home-gear">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8B8580" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                  </svg>
                </div>
                <div className="flex flex-col items-center home-title-wrap">
                  <h1 className="home-title">今天吃什么</h1>
                  <div style={{ width: 0, height: 0, borderLeft: "10px solid transparent", borderRight: "10px solid transparent", borderTop: "14px solid #FF5F2E", marginTop: 14, filter: "drop-shadow(0 4px 6px rgba(255,95,46,0.25))" }} />
                </div>
                <div className="flex flex-col items-center gap-1" style={{ paddingTop: 3 }}>
                  <span className={showResultText ? "fire-pulse" : ""}>
                    <FireIcon />
                  </span>
                  <span className="font-black" style={{ color: "#111", fontSize: 28, lineHeight: 1 }}>{spinCount}</span>
                </div>
              </div>

              {/* Card carousel area */}
              <div
                className="w-full flex items-center justify-center relative"
                style={{ height: CARD_HEIGHT + 104, marginTop: 0, touchAction: "pan-y" }}
                onPointerDown={(e) => handleDragStart(e.clientX)}
                onPointerMove={(e) => handleDragMove(e.clientX)}
                onPointerUp={() => handleDragEnd()}
                onPointerLeave={() => handleDragEnd()}
              >
                <div className="relative" style={{ width: "100%", height: CARD_HEIGHT + 42 }}>
                  {cards.map(({ food, x, offset, cardIdx }) => {
                    const isCenter = Math.abs(offset) < 0.5;
                    const isSide = Math.abs(offset) === 1;
                    const w = isCenter ? CARD_WIDTH : SIDE_CARD_WIDTH;
                    const h = isCenter ? CARD_HEIGHT : SIDE_CARD_HEIGHT;
                    const rot = offset < 0 ? -8 : offset > 0 ? 8 : 0;
                    const z = isCenter ? 3 : Math.abs(offset) === 1 ? 2 : 1;
                    const opacity = isCenter ? 1 : isSide ? 0.94 : 0.34;
                    const scale = isCenter ? (isResult && showResultText ? 1.03 : 1) : 0.94;

                    return (
                      <div
                        key={`${cardIdx}-${offset}`}
                        className="absolute"
                        style={{
                          left: "50%",
                          top: isCenter ? 14 : 54,
                          transform: `translateX(calc(-50% + ${x}px)) rotate(${rot}deg) scale(${scale})`,
                          zIndex: z,
                          opacity,
                          transition: (isCarouselMoving || isDragging) ? "none" : "transform 0.3s ease",
                        }}
                      >
                        <FoodCard
                          food={food}
                          width={w}
                          height={h}
                          isCenter={isCenter}
                          motionBlur={isCarouselMoving && !isCenter}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Hint text */}
              <div className="home-hints">
                <span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M8 13V6a2 2 0 1 1 4 0v6" />
                    <path d="M12 12V5a2 2 0 1 1 4 0v8" />
                    <path d="M16 13V8a2 2 0 1 1 4 0v7c0 4-2.4 7-7 7h-1c-2.8 0-4.6-1.3-6-3.5L4 15a2 2 0 0 1 3.4-2.1L9 15" />
                  </svg>
                  点击卡片查看
                </span>
                <span>
                  <svg width="18" height="14" viewBox="0 0 28 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 4 4 9l5 5" />
                    <path d="M19 4l5 5-5 5" />
                    <path d="M5 9h18" />
                  </svg>
                  左右滑动切换
                </span>
              </div>

              <div className="home-bottom-controls">
                <BottomActionButton label="卡片仓库" type="warehouse" onClick={() => setCurrentPage("warehouse")} />
                <div className="home-knob-wrap">
                  <Knob spinning={isSpinning} onClick={handleKnobClick} />
                </div>
                <BottomActionButton label="清除记录" type="trash" onClick={handleClearHistory} />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="warehouse"
              className="w-full h-full flex flex-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <CardWarehouse
                allFoods={allFoods}
                visibleCardIds={remainingCards}
                onToggleCardVisibility={handleToggleCardVisibility}
                onDeleteCustom={handleDeleteCustomFood}
                onOpenMaker={() => setShowMaker(true)}
                onGoHome={() => setCurrentPage("home")}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Card maker modal */}
      <AnimatePresence>
        {showMaker && (
          <CardMaker
            key="maker"
            onClose={() => setShowMaker(false)}
            onSave={handleSaveCustomFood}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
