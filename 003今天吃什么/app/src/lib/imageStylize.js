// SvG paper-noise texture. Rendered onto canvas so it blends naturally.
const PAPER_NOISE_SVG = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
    <filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="4" stitchTiles="stitch"/></filter>
    <rect width="256" height="256" filter="url(#n)" opacity="0.04"/>
  </svg>`
)}`;

/**
 * Load an image from a data URL or src string.
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Apply a warm color matrix via ImageData.
 * Warmer: boost red, slightly reduce blue.
 */
function applyWarmTone(imageData) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = Math.min(255, d[i]     * 1.12); // R +
    d[i + 1] = Math.min(255, d[i + 1] * 1.05); // G +
    d[i + 2] = Math.min(255, d[i + 2] * 0.88); // B −
    // Alpha stays
  }
}

/**
 * Boost saturation slightly via HSV transform.
 */
function applySaturation(imageData, factor) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255;
    const g = d[i + 1] / 255;
    const b = d[i + 2] / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    if (max === min) continue; // grey — skip

    const s = l <= 0.5 ? (max - min) / (max + min) : (max - min) / (2 - max - min);
    const newS = Math.min(1, s * factor);

    const h = (() => {
      const delta = max - min;
      if (max === r) return ((g - b) / delta + (g < b ? 6 : 0)) / 6;
      if (max === g) return ((b - r) / delta + 2) / 6;
      return ((r - g) / delta + 4) / 6;
    })();

    const q = l < 0.5 ? l * (1 + newS) : l + newS - l * newS;
    const p = 2 * l - q;

    const hue2rgb = (tt) => {
      let t = tt < 0 ? tt + 1 : tt > 1 ? tt - 1 : tt;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    d[i]     = Math.round(hue2rgb(h + 1 / 3) * 255);
    d[i + 1] = Math.round(hue2rgb(h) * 255);
    d[i + 2] = Math.round(hue2rgb(h - 1 / 3) * 255);
  }
}

/**
 * Adjust brightness and contrast.
 * brightness: 0 = no change, positive = brighter
 * contrast: 1 = no change, >1 = more contrast
 */
function applyBrightnessContrast(imageData, brightness, contrast) {
  const d = imageData.data;
  const bVal = brightness * 255;
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = Math.min(255, Math.max(0, contrast * (d[i]     - 128) + 128 + bVal));
    d[i + 1] = Math.min(255, Math.max(0, contrast * (d[i + 1] - 128) + 128 + bVal));
    d[i + 2] = Math.min(255, Math.max(0, contrast * (d[i + 2] - 128) + 128 + bVal));
  }
}

/**
 * Apply a soft vignette (dark corners).
 */
function applyVignette(ctx, w, h) {
  const gradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.75);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(0.5, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Extract the dominant color from an image element and convert to Morandi palette.
 * Samples center 60% of the image, buckets colors, picks the most frequent hue family.
 * @param {HTMLImageElement} img
 * @returns {{ color: string, accent: string }} hex colors
 */
export function extractDominantColor(img) {
  const SIZE = 128;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  const minDim = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - minDim) / 2;
  const sy = (img.naturalHeight - minDim) / 2;
  ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, SIZE, SIZE);

  // Sample center 60% to avoid edges/background
  const margin = Math.floor(SIZE * 0.2);
  const imageData = ctx.getImageData(margin, margin, SIZE - margin * 2, SIZE - margin * 2);
  const d = imageData.data;

  // Bucket by hue (36 buckets = 10° each), count per bucket
  const buckets = new Array(36).fill(null).map(() => ({ r: 0, g: 0, b: 0, count: 0 }));

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    if (sat < 0.1 || max < 40) continue; // skip grey/dark

    const h = (() => {
      const delta = max - min;
      if (max === r) return ((g - b) / delta + (g < b ? 6 : 0)) / 6;
      if (max === g) return ((b - r) / delta + 2) / 6;
      return ((r - g) / delta + 4) / 6;
    })();

    const bucketIdx = Math.floor(h * 36) % 36;
    buckets[bucketIdx].r += r;
    buckets[bucketIdx].g += g;
    buckets[bucketIdx].b += b;
    buckets[bucketIdx].count++;
  }

  // Find the bucket with most pixels
  let best = buckets.reduce((a, b) => b.count > a.count ? b : a);
  if (best.count === 0) {
    // Fallback: average all non-grey pixels
    best = { r: 200, g: 170, b: 130, count: 1 };
  }

  const avgR = best.r / best.count;
  const avgG = best.g / best.count;
  const avgB = best.b / best.count;

  return toMorandi(avgR, avgG, avgB);
}

/**
 * Convert an RGB color to Morandi palette (low saturation, soft, dusty feel).
 */
function toMorandi(r, g, b) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  if (max === min) {
    const hex = toHex(r, g, b);
    return { color: hex, accent: darken(r, g, b, 0.15) };
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = (() => {
    if (max === r / 255) return ((g / 255 - b / 255) / d + (g < b ? 6 : 0)) / 6;
    if (max === g / 255) return ((b / 255 - r / 255) / d + 2) / 6;
    return ((r / 255 - g / 255) / d + 4) / 6;
  })();

  // Morandi: desaturate to 25-45%, lightness 78-88%
  const morandiS = 0.25 + s * 0.20;
  const morandiL = 0.78 + (l - 0.5) * 0.15;

  const hue2rgb = (p, q, t) => {
    let tt = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const q = morandiL < 0.5 ? morandiL * (1 + morandiS) : morandiL + morandiS - morandiL * morandiS;
  const p = 2 * morandiL - q;

  const nr = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const ng = Math.round(hue2rgb(p, q, h) * 255);
  const nb = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);

  return {
    color: `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`,
    accent: darken(nr, ng, nb, 0.18),
  };
}

function toHex(r, g, b) {
  return `#${Math.round(r).toString(16).padStart(2, '0')}${Math.round(g).toString(16).padStart(2, '0')}${Math.round(b).toString(16).padStart(2, '0')}`;
}

function darken(r, g, b, amount) {
  return toHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

/**
 * Main pipeline: take an image element and return a stylized data URL.
 * @param {HTMLImageElement} img - The uploaded image
 * @returns {Promise<string>} Data URL of processed image
 */
export async function stylizeImage(img) {
  const SIZE = 512; // normalize to 512px square for consistent processing & memory

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  // 1. Draw image centered-crop to square
  const minDim = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - minDim) / 2;
  const sy = (img.naturalHeight - minDim) / 2;
  ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, SIZE, SIZE);

  // 2. Warm tone
  let imageData = ctx.getImageData(0, 0, SIZE, SIZE);
  applyWarmTone(imageData);
  ctx.putImageData(imageData, 0, 0);

  // 3. Saturation boost
  imageData = ctx.getImageData(0, 0, SIZE, SIZE);
  applySaturation(imageData, 1.35);
  ctx.putImageData(imageData, 0, 0);

  // 4. Brightness & contrast (soft look)
  imageData = ctx.getImageData(0, 0, SIZE, SIZE);
  applyBrightnessContrast(imageData, 0.04, 1.05);
  ctx.putImageData(imageData, 0, 0);

  // 5. Slight blur (stack blur approximation via scaled draws)
  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = SIZE / 4;
  blurCanvas.height = SIZE / 4;
  const blurCtx = blurCanvas.getContext('2d');
  blurCtx.drawImage(canvas, 0, 0, SIZE / 4, SIZE / 4);
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.save();
  ctx.filter = 'blur(1.5px)';
  ctx.drawImage(blurCanvas, 0, 0, SIZE, SIZE);
  ctx.filter = 'none';

  // 6. Vignette
  applyVignette(ctx, SIZE, SIZE);

  // 7. Paper noise overlay
  try {
    const noiseImg = await loadImage(PAPER_NOISE_SVG);
    ctx.drawImage(noiseImg, 0, 0, SIZE, SIZE);
  } catch {
    // Noise is cosmetic — ignore if it fails
  }

  return canvas.toDataURL('image/jpeg', 0.92);
}
