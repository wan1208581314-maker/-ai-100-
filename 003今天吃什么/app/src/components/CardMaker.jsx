import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { extractDominantColor } from "../lib/imageStylize";
import CustomFoodCard from "./CustomFoodCard";
import { FloatingNav, StatusBar } from "./MobileChrome";

const CATEGORIES = ["家常", "面食", "夜宵", "快餐", "轻食"];

const TAG_OPTIONS = ["下饭", "家常菜", "香辣", "清淡", "重口", "快手", "健康", "解馋", "聚餐", "夜宵"];
const CROP_FRAME_WIDTH = 276;
const CROP_FRAME_HEIGHT = 274;
const CROP_FRAME_ASPECT = CROP_FRAME_WIDTH / CROP_FRAME_HEIGHT;
const MIN_CROP_SCALE = 1;
const MAX_CROP_SCALE = 4;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getCoverSize(img, frameW, frameH, scale = 1) {
  const imgAspect = img.naturalWidth / img.naturalHeight;
  const frameAspect = frameW / frameH;
  let displayW;
  let displayH;
  if (imgAspect > frameAspect) {
    displayH = frameH;
    displayW = displayH * imgAspect;
  } else {
    displayW = frameW;
    displayH = displayW / imgAspect;
  }
  return { displayW: displayW * scale, displayH: displayH * scale };
}

function BackIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4A3728" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9A8A7A" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CloseSmallIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function CardMaker({ onClose, onSave }) {
  const [rawImage, setRawImage] = useState(null);
  const [processedImage, setProcessedImage] = useState(null);
  const [foodName, setFoodName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [customTag, setCustomTag] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [extractedColor, setExtractedColor] = useState(null);
  const [isCropping, setIsCropping] = useState(false);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [cropScale, setCropScale] = useState(1);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const cropDragRef = useRef({ startX: 0, startY: 0, offsetX: 0, offsetY: 0 });
  const activeCropPointersRef = useRef(new Map());
  const cropGestureRef = useRef({ distance: 0, centerX: 0, centerY: 0, offsetX: 0, offsetY: 0, scale: 1 });
  const cropContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const rawImageRef = useRef(null);

  const toggleTag = useCallback((tag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : prev.length < 3 ? [...prev, tag] : prev
    );
  }, []);

  const handleCategoryPick = useCallback((cat) => {
    setSelectedCategory((prev) => (prev === cat ? "" : cat));
  }, []);

  const handleAddCustomTag = useCallback(() => {
    const nextTag = customTag.trim().slice(0, 6);
    if (!nextTag) return;
    setSelectedTags((prev) => {
      if (prev.includes(nextTag) || prev.length >= 3) return prev;
      return [...prev, nextTag];
    });
    setCustomTag("");
  }, [customTag]);

  const handleFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      setRawImage(dataUrl);
      // Show crop editor
      const img = new Image();
      img.onload = () => {
        setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
        setCropOffset({ x: 0, y: 0 });
        setCropScale(1);
        setIsCropping(true);
        rawImageRef.current = img;
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleCropConfirm = useCallback(() => {
    if (!rawImageRef.current) return;
    const img = rawImageRef.current;
    const container = cropContainerRef.current;
    if (!container) return;

    const containerW = container.offsetWidth;
    const containerH = container.offsetHeight;
    const { displayW, displayH } = getCoverSize(img, containerW, containerH, cropScale);

    // The image is centered, then offset by cropOffset
    const imgLeft = (containerW - displayW) / 2 + cropOffset.x;
    const imgTop = (containerH - displayH) / 2 + cropOffset.y;

    // What portion of the original image is visible?
    // visible area in display coordinates: from (-imgLeft, -imgTop) with size (containerW, containerH)
    // Scale factor from display to original:
    const scaleX = img.naturalWidth / displayW;
    const scaleY = img.naturalHeight / displayH;

    const sx = -imgLeft * scaleX;
    const sy = -imgTop * scaleY;
    const sw = containerW * scaleX;
    const sh = containerH * scaleY;

    const outW = 900;
    const outH = Math.round(outW * (CROP_FRAME_HEIGHT / CROP_FRAME_WIDTH));
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

    const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setProcessedImage(croppedDataUrl);
    setIsCropping(false);

    const croppedImg = new Image();
    croppedImg.onload = () => {
      try {
        const color = extractDominantColor(croppedImg);
        setExtractedColor(color);
      } catch {
        setExtractedColor({ color: "#F5EDE0", accent: "#D4C4B0" });
      }
    };
    croppedImg.src = croppedDataUrl;
  }, [cropOffset, cropScale]);

  const clampCropOffset = useCallback((nextOffset, nextScale) => {
    const img = rawImageRef.current;
    const container = cropContainerRef.current;
    if (!img || !container) return nextOffset;
    const containerW = container.offsetWidth;
    const containerH = container.offsetHeight;
    const { displayW, displayH } = getCoverSize(img, containerW, containerH, nextScale);
    const maxX = Math.max(0, (displayW - containerW) / 2);
    const maxY = Math.max(0, (displayH - containerH) / 2);
    return {
      x: clamp(nextOffset.x, -maxX, maxX),
      y: clamp(nextOffset.y, -maxY, maxY),
    };
  }, []);

  const getGestureInfo = useCallback((points) => {
    const [first, second] = points;
    const centerX = (first.x + second.x) / 2;
    const centerY = (first.y + second.y) / 2;
    const distance = Math.hypot(first.x - second.x, first.y - second.y);
    return { centerX, centerY, distance };
  }, []);

  const handleCropPointerDown = useCallback((e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    activeCropPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const points = [...activeCropPointersRef.current.values()];
    if (points.length >= 2) {
      const gesture = getGestureInfo(points.slice(0, 2));
      cropGestureRef.current = {
        ...gesture,
        offsetX: cropOffset.x,
        offsetY: cropOffset.y,
        scale: cropScale,
      };
      return;
    }
    cropDragRef.current = { startX: e.clientX, startY: e.clientY, offsetX: cropOffset.x, offsetY: cropOffset.y };
  }, [cropOffset, cropScale, getGestureInfo]);

  const handleCropPointerMove = useCallback((e) => {
    if (!activeCropPointersRef.current.has(e.pointerId)) return;
    e.preventDefault();
    activeCropPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const points = [...activeCropPointersRef.current.values()];
    if (points.length >= 2) {
      const gesture = getGestureInfo(points.slice(0, 2));
      const start = cropGestureRef.current;
      const nextScale = clamp(start.scale * (gesture.distance / Math.max(start.distance, 1)), MIN_CROP_SCALE, MAX_CROP_SCALE);
      const nextOffset = clampCropOffset({
        x: start.offsetX + gesture.centerX - start.centerX,
        y: start.offsetY + gesture.centerY - start.centerY,
      }, nextScale);
      setCropScale(nextScale);
      setCropOffset(nextOffset);
      return;
    }
    const dx = e.clientX - cropDragRef.current.startX;
    const dy = e.clientY - cropDragRef.current.startY;
    setCropOffset(clampCropOffset({
      x: cropDragRef.current.offsetX + dx,
      y: cropDragRef.current.offsetY + dy,
    }, cropScale));
  }, [clampCropOffset, cropScale, getGestureInfo]);

  const handleCropPointerEnd = useCallback((e) => {
    activeCropPointersRef.current.delete(e.pointerId);
    const points = [...activeCropPointersRef.current.values()];
    if (points.length >= 2) {
      const gesture = getGestureInfo(points.slice(0, 2));
      cropGestureRef.current = {
        ...gesture,
        offsetX: cropOffset.x,
        offsetY: cropOffset.y,
        scale: cropScale,
      };
      return;
    }
    if (points.length === 1) {
      cropDragRef.current = { startX: points[0].x, startY: points[0].y, offsetX: cropOffset.x, offsetY: cropOffset.y };
    }
  }, [cropOffset, cropScale, getGestureInfo]);

  const handleFileChange = (e) => {
    handleFile(e.target.files?.[0]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const displayImage = processedImage || rawImage;
  const canSave = processedImage && foodName.trim().length > 0 && selectedCategory;
  const customSelectedTags = selectedTags.filter((tag) => !TAG_OPTIONS.includes(tag));

  const handleSave = () => {
    if (!canSave) return;
    const newFood = {
      id: `custom-${Date.now()}`,
      name: foodName.trim(),
      image: processedImage,
      tags: selectedTags.length > 0 ? selectedTags : ["自定义"],
      color: extractedColor?.color || "#F5EDE0",
      accent: extractedColor?.accent || "#D4C4B0",
      category: selectedCategory,
      isCustom: true,
    };
    onSave(newFood);
  };

  return (
    <motion.div
      className="maker-page fixed inset-0 z-50 flex flex-col"
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <StatusBar />

      <div className="maker-header">
        <button onClick={onClose} className="maker-back-button" type="button">
          <BackIcon />
        </button>
        <h1>新增卡片</h1>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="maker-header-save"
        >
          保存
        </button>
      </div>

      {isCropping && rawImage && (
        <div className="crop-editor fixed inset-0 z-[60] flex flex-col">
          <div className="crop-editor-header">
            <button type="button" onClick={() => setIsCropping(false)}>取消</button>
            <span>调整截取范围</span>
            <button type="button" onClick={handleCropConfirm}>确认</button>
          </div>
          <div className="flex-1 flex items-center justify-center" style={{ padding: "0 16px" }}>
            <div
              ref={cropContainerRef}
              className="crop-frame relative overflow-hidden"
              style={{
                width: "100%",
                maxWidth: 380,
                aspectRatio: `${CROP_FRAME_WIDTH} / ${CROP_FRAME_HEIGHT}`,
                borderRadius: 18,
                border: "3px solid #80C931",
                touchAction: "none",
              }}
              onPointerDown={handleCropPointerDown}
              onPointerMove={handleCropPointerMove}
              onPointerUp={handleCropPointerEnd}
              onPointerCancel={handleCropPointerEnd}
              onPointerLeave={handleCropPointerEnd}
            >
              <img
                src={rawImage}
                alt="裁剪"
                className="pointer-events-none"
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transform: `translate(calc(-50% + ${cropOffset.x}px), calc(-50% + ${cropOffset.y}px))`,
                  maxWidth: "none",
                  maxHeight: "none",
                  width: imgSize.w / imgSize.h < CROP_FRAME_ASPECT ? `${100 * cropScale}%` : "auto",
                  height: imgSize.w / imgSize.h < CROP_FRAME_ASPECT ? "auto" : `${100 * cropScale}%`,
                }}
                draggable={false}
              />
              <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.25 }}>
                <div className="absolute" style={{ left: "33.33%", top: 0, bottom: 0, width: 1, background: "#fff" }} />
                <div className="absolute" style={{ left: "66.66%", top: 0, bottom: 0, width: 1, background: "#fff" }} />
                <div className="absolute" style={{ top: "33.33%", left: 0, right: 0, height: 1, background: "#fff" }} />
                <div className="absolute" style={{ top: "66.66%", left: 0, right: 0, height: 1, background: "#fff" }} />
              </div>
            </div>
          </div>
          <div className="crop-editor-help">单指移动，双指缩放；绿色框就是卡片图片区域</div>
        </div>
      )}

      <div className="maker-content">
        <section className="maker-upload-panel">
          <div className="maker-section-copy">
            <h2>上传美食照片</h2>
            <p>会统一裁切成卡片比例</p>
            {displayImage && (
              <button type="button" onClick={() => fileInputRef.current?.click()}>
                重新选择
              </button>
            )}
          </div>
          <div
            className={isDragOver ? "maker-upload-box drag-over" : "maker-upload-box"}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            {displayImage ? (
              <img src={displayImage} alt="预览" />
            ) : (
              <div className="maker-upload-empty">
                <PlusIcon />
                <span>点击上传</span>
              </div>
            )}
          </div>
        </section>

        <section className="maker-form-panel">
          <label className="maker-field-row">
            <span>菜名</span>
            <input
              type="text"
              value={foodName}
              onChange={(e) => setFoodName(e.target.value)}
              placeholder="输入菜名"
              maxLength={8}
            />
          </label>

          <div className="maker-field-block">
            <span>分类</span>
            <div className="maker-chip-row">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onPointerUp={() => handleCategoryPick(cat)}
                  className={selectedCategory === cat ? "active" : ""}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="maker-field-block">
            <span>标签</span>
            <div className="maker-chip-row">
              {TAG_OPTIONS.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onPointerUp={() => toggleTag(tag)}
                    className={isSelected ? "active maker-tag-selected" : ""}
                  >
                    {tag}
                    {isSelected && <CloseSmallIcon />}
                  </button>
                );
              })}
              {customSelectedTags.map((tag) => (
                <button
                  key={`custom-${tag}`}
                  type="button"
                  onPointerUp={() => toggleTag(tag)}
                  className="active maker-tag-selected"
                >
                  {tag}
                  <CloseSmallIcon />
                </button>
              ))}
              <label className="maker-custom-tag">
                <input
                  type="text"
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCustomTag();
                    }
                  }}
                  placeholder={selectedTags.length >= 3 ? "最多3个标签" : "自定义标签"}
                  maxLength={6}
                  disabled={selectedTags.length >= 3}
                />
                <button
                  type="button"
                  onClick={handleAddCustomTag}
                  disabled={!customTag.trim() || selectedTags.length >= 3}
                >
                  添加
                </button>
              </label>
            </div>
          </div>
        </section>

        <section className="maker-preview-panel">
          <h2>卡片预览</h2>
          {displayImage && foodName.trim() ? (
            <CustomFoodCard
              food={{
                name: foodName.trim(),
                image: displayImage,
                tags: selectedTags.length > 0 ? selectedTags : ["自定义"],
                color: extractedColor?.color || "#F5EDE0",
                accent: extractedColor?.accent || "#8B7355",
              }}
              width={146}
              height={195}
            />
          ) : (
            <div className="maker-preview-empty">
              <span>预览</span>
            </div>
          )}
        </section>
      </div>

      <div className="maker-save-wrap">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className={canSave ? "ready" : ""}
        >
          保存到仓库
        </button>
      </div>
      <FloatingNav active="warehouse" onHome={onClose} onWarehouse={onClose} />
    </motion.div>
  );
}
