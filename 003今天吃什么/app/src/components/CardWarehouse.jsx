import { useState } from "react";
import CustomFoodCard from "./CustomFoodCard";
import { FloatingNav, StatusBar } from "./MobileChrome";

const CATEGORIES = ["全部", "家常", "面食", "夜宵", "快餐", "轻食"];

function PlusIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TrashSmallIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}

function FireIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 2C6.5 8 4 12 4 15a8 8 0 0016 0c0-3-2.5-7-8-13z" fill="url(#fireGrad2)" stroke="#CC4400" strokeWidth="0.5" />
      <path d="M12 10c-2 3-3 5-3 6.5a3 3 0 006 0c0-1.5-1-3.5-3-6.5z" fill="#FFB347" />
      <defs>
        <linearGradient id="fireGrad2" x1="12" y1="2" x2="12" y2="22">
          <stop offset="0%" stopColor="#FF6B35" />
          <stop offset="50%" stopColor="#FF4444" />
          <stop offset="100%" stopColor="#CC2200" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function CardWarehouse({ allFoods, onDeleteCustom, onOpenMaker, onGoHome }) {
  const [activeCategory, setActiveCategory] = useState("全部");
  const spinCount = parseInt(localStorage.getItem("spinCount") || "0", 10);

  const filteredFoods = activeCategory === "全部"
    ? allFoods
    : allFoods.filter((f) => f.category === activeCategory);

  return (
    <div className="warehouse-page w-full h-full flex flex-col relative">
      <StatusBar />

      <div className="warehouse-header">
        <div style={{ width: 52 }} />
        <h1>卡片仓库</h1>
        <div className="warehouse-fire">
          <FireIcon />
          <span>{spinCount}</span>
        </div>
      </div>

      <div className="warehouse-tabs">
        <div className="warehouse-tabs-track">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={activeCategory === cat ? "active" : ""}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="warehouse-grid-wrap">
        <div className="warehouse-grid">
          {filteredFoods.map((food) => (
            <div key={food.id} className="relative">
              {food.isCustom ? (
                <div className="warehouse-card-cell">
                  <CustomFoodCard food={food} width="100%" height="100%" />
                </div>
              ) : (
                <div className="warehouse-card-cell">
                  <img
                    src={food.image}
                    alt=""
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                </div>
              )}

              {/* Delete button for custom cards */}
              {food.isCustom && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteCustom(food.id);
                  }}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center"
                  style={{
                    background: "rgba(220,60,60,0.8)",
                    backdropFilter: "blur(4px)",
                    zIndex: 2,
                  }}
                >
                  <TrashSmallIcon />
                </button>
              )}
            </div>
          ))}

          {/* Add new card button */}
          <button
            onClick={onOpenMaker}
            className="warehouse-add-card"
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #FF8C42 0%, #FF6B35 100%)" }}
            >
              <PlusIcon />
            </div>
          </button>
        </div>
      </div>
      <FloatingNav active="warehouse" onHome={onGoHome} onWarehouse={() => {}} />
    </div>
  );
}
