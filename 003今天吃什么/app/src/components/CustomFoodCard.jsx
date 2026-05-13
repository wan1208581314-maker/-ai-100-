const TAG_STYLES = [
  { background: "#F59F82", color: "#754835" },
  { background: "#F3C866", color: "#72532A" },
  { background: "#B9D77A", color: "#51682E" },
];

function readableInk(hex, fallback = "#6F5647") {
  if (!hex) return fallback;
  const h = hex.replace("#", "");
  if (h.length !== 6) return fallback;
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (luminance > 0.62) return fallback;
  return hex;
}

export default function CustomFoodCard({ food, width, height, motionBlur = false }) {
  const numericWidth = typeof width === "number" ? width : 112;
  const scale = numericWidth / 292;
  const tags = (food.tags?.length ? food.tags : ["自定义"]).slice(0, 3);
  const ink = readableInk(food.accent);

  return (
    <div
      className="custom-food-card"
      style={{
        width,
        height,
        borderRadius: 34 * scale,
        background: food.color || "#F4D6E4",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.34)",
      }}
    >
      <div
        className="custom-food-title"
        style={{
          height: 72 * scale,
          padding: `${16 * scale}px ${18 * scale}px 0`,
          color: ink,
          fontSize: 34 * scale,
          fontWeight: 900,
          lineHeight: 1.05,
          textAlign: "center",
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
          textShadow: "0 1px 0 rgba(255,255,255,0.42)",
        }}
      >
        {food.name}
      </div>

      <div
        className="custom-food-image-wrap"
        style={{
          margin: `0 ${8 * scale}px`,
          height: 274 * scale,
          borderRadius: 20 * scale,
          overflow: "hidden",
          background: "rgba(255,255,255,0.28)",
        }}
      >
        <img
          src={food.image}
          alt=""
          draggable={false}
          className="custom-food-image"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            filter: motionBlur ? "blur(3px)" : undefined,
          }}
        />
      </div>

      <div
        className="custom-food-tags"
        style={{
          minHeight: 43 * scale,
          padding: `${7 * scale}px ${18 * scale}px ${8 * scale}px`,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 11 * scale,
          flexWrap: "nowrap",
        }}
      >
        {tags.map((tag, index) => {
          const tagStyle = TAG_STYLES[index % TAG_STYLES.length];
          return (
            <span
              key={`${tag}-${index}`}
              style={{
                minWidth: 62 * scale,
                maxWidth: 88 * scale,
                padding: `${5 * scale}px ${11 * scale}px`,
                borderRadius: 999,
                background: tagStyle.background,
                color: tagStyle.color,
                fontSize: 16 * scale,
                fontWeight: 900,
                lineHeight: 1.05,
                textAlign: "center",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {tag}
            </span>
          );
        })}
      </div>
    </div>
  );
}
