function HomeGlyph({ active = false }) {
  return (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke={active ? "#F07934" : "#A79A8A"} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 10.5 12 3.7l8.5 6.8" />
      <path d="M5.5 9.8v9.5h13V9.8" />
      <path d="M9.4 19.3v-5.8h5.2v5.8" />
    </svg>
  );
}

function WarehouseGlyph({ active = false }) {
  return (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke={active ? "#F07934" : "#A79A8A"} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="6.3" height="6.3" rx="1.4" />
      <rect x="13.7" y="4" width="6.3" height="6.3" rx="1.4" />
      <rect x="4" y="13.7" width="6.3" height="6.3" rx="1.4" />
      <rect x="13.7" y="13.7" width="6.3" height="6.3" rx="1.4" />
    </svg>
  );
}

function TrashGlyph() {
  return (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#9C8E80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 14h10l1-14" />
      <path d="M9 7V4h6v3" />
    </svg>
  );
}

export function StatusBar() {
  return null;
}

export function BottomActionButton({ label, type = "home", active = false, onClick }) {
  const icon = type === "warehouse" ? <WarehouseGlyph active={active} /> : type === "trash" ? <TrashGlyph /> : <HomeGlyph active={active} />;
  return (
    <button type="button" className="home-action-button" onClick={onClick}>
      <span className="home-action-icon">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export function FloatingNav({ active = "home", onHome, onWarehouse }) {
  return (
    <div className="floating-nav">
      <button type="button" className={active === "home" ? "active" : ""} onClick={onHome}>
        <HomeGlyph active={active === "home"} />
        <span>首页</span>
      </button>
      <button type="button" className={active === "warehouse" ? "active" : ""} onClick={onWarehouse}>
        <WarehouseGlyph active={active === "warehouse"} />
        <span>卡片仓库</span>
      </button>
    </div>
  );
}
