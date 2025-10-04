"use client";

import { useEffect, useState } from "react";

// Legacy single-color cache (primary) & expanded palette cache
const colorCache = new Map<string, string>();
interface TeamPaletteCacheEntry {
  primary: string | null;
  secondary: string | null;
  accent: string | null;
  palette: string[];
}
const paletteCache = new Map<string, TeamPaletteCacheEntry>();

interface Bucket {
  count: number;
  r: number;
  g: number;
  b: number;
  avgR: number;
  avgG: number;
  avgB: number;
  saturation: number;
  brightness: number;
}

/**
 * Quantize 8-bit RGB components into a compact 15-bit bucket key (5 bits per channel)
 * to reduce the color space for frequency analysis.
 * @param r Red 0-255
 * @param g Green 0-255
 * @param b Blue 0-255
 * @returns Packed integer key
 */
function quantizeKey(r: number, g: number, b: number): number {
  // 5 bits per channel (0-31) => combine into 15-bit key
  return ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
}

/**
 * Approximate saturation using (max - min) / max. Fast heuristic adequate for filtering low-chroma colors.
 * @param r Red 0-255
 * @param g Green 0-255
 * @param b Blue 0-255
 * @returns Saturation 0-1
 */
function computeSaturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max; // approximate (not perceptual but fine for filtering)
}

/**
 * Extract raw color buckets from an image element by sampling pixels and aggregating
 * into quantized buckets with running averages & metadata.
 * @param img Loaded HTMLImageElement
 * @returns Array of bucket objects or null if unavailable / CORS blocked
 */
function extractRawBuckets(img: HTMLImageElement): Bucket[] | null {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const w = (canvas.width = img.naturalWidth || img.width);
    const h = (canvas.height = img.naturalHeight || img.height);
    if (w === 0 || h === 0) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    const totalPixels = data.length / 4;
    const TARGET_SAMPLES = 8000; // cap number of sampled pixels
    const stride = Math.max(1, Math.floor(totalPixels / TARGET_SAMPLES));

    const bucketMap = new Map<number, Bucket>();

    for (let p = 0; p < totalPixels; p += stride) {
      const i = p * 4;
      if (i + 3 >= data.length) break;
      const a = data[i + 3] ?? 0;
      if (a < 180) continue; // skip transparent
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const sat = computeSaturation(r, g, b);
      const key = quantizeKey(r, g, b);
      let bucket = bucketMap.get(key);
      if (!bucket) {
        bucket = {
          count: 0,
          r: 0,
          g: 0,
          b: 0,
          avgR: 0,
          avgG: 0,
          avgB: 0,
          saturation: 0,
          brightness: 0,
        };
        bucketMap.set(key, bucket);
      }
      bucket.count++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.avgR = bucket.r / bucket.count;
      bucket.avgG = bucket.g / bucket.count;
      bucket.avgB = bucket.b / bucket.count;
      bucket.saturation = sat;
      bucket.brightness = brightness;
    }

    if (bucketMap.size === 0) return null;
    return Array.from(bucketMap.values());
  } catch {
    return null; // likely CORS taint
  }
}

/**
 * Rank buckets by frequency, then saturation, then closeness to mid brightness.
 * @param buckets Raw buckets
 * @returns New sorted bucket array
 */
function rankBuckets(buckets: Bucket[]): Bucket[] {
  return buckets.slice().sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count; // frequency
    if (b.saturation !== a.saturation) return b.saturation - a.saturation; // colorfulness
    const aDist = Math.abs(a.brightness - 128);
    const bDist = Math.abs(b.brightness - 128);
    return aDist - bDist; // prefer mid brightness
  });
}

/**
 * Convert ranked buckets into a unique hex color palette (ordered highest importance first).
 * @param buckets Bucket list
 * @returns Array of unique hex colors (e.g. #RRGGBB)
 */
function bucketsToPalette(buckets: Bucket[]): string[] {
  const ranked = rankBuckets(buckets);
  const colors = ranked.map(
    (bkt) =>
      "#" +
      [bkt.avgR, bkt.avgG, bkt.avgB]
        .map((v) => Math.round(v).toString(16).padStart(2, "0"))
        .join(""),
  );
  const uniq: string[] = [];
  for (const c of colors) if (!uniq.includes(c)) uniq.push(c);
  return uniq;
}

/**
 * Choose a primary color from a derived palette using bucket saturation & brightness heuristics.
 * @param palette Ordered hex palette
 * @param buckets Original bucket data (for saturation/brightness lookups)
 * @returns Primary hex color or null
 */
function choosePrimary(palette: string[], buckets: Bucket[]): string | null {
  if (!palette.length) return null;
  const byHex = new Map(
    buckets.map(
      (b) =>
        [
          "#" +
            [b.avgR, b.avgG, b.avgB]
              .map((v) => Math.round(v).toString(16).padStart(2, "0"))
              .join(""),
          b,
        ] as const,
    ),
  );
  const candidate = palette.find((hex) => {
    const bucket = byHex.get(hex);
    return (
      bucket &&
      bucket.saturation > 0.15 &&
      bucket.brightness > 25 &&
      bucket.brightness < 230
    );
  });
  return candidate ?? palette[0] ?? null;
}

/**
 * Euclidean distance in RGB space between two hex colors (#RRGGBB). Fast, non-perceptual.
 * @param c1 First hex color
 * @param c2 Second hex color
 * @returns Distance (0-~441)
 */
function colorDistance(c1: string, c2: string): number {
  function toRGB(c: string): [number, number, number] {
    const h = c.startsWith("#") ? c.slice(1) : c;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return [
      Number.isFinite(r) ? r : 0,
      Number.isFinite(g) ? g : 0,
      Number.isFinite(b) ? b : 0,
    ];
  }
  const [r1, g1, b1] = toRGB(c1);
  const [r2, g2, b2] = toRGB(c2);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/**
 * Derive primary, secondary, and accent colors from a base palette.
 * Ensures secondary/accent are sufficiently distinct, generating lightened/darkened fallbacks if needed.
 * @param palette Ordered palette list
 * @param buckets Raw buckets (for primary heuristic via choosePrimary)
 * @returns Palette cache entry with primary/secondary/accent
 */
function derivePalette(
  palette: string[],
  buckets: Bucket[],
): TeamPaletteCacheEntry {
  const primary = choosePrimary(palette, buckets);
  let secondary: string | null = null;
  let accent: string | null = null;
  for (const c of palette) {
    if (!primary) break;
    if (!secondary && c !== primary && colorDistance(primary, c) > 40) {
      secondary = c;
      continue;
    }
    if (
      secondary &&
      !accent &&
      c !== primary &&
      c !== secondary &&
      colorDistance(secondary, c) > 40
    ) {
      accent = c;
      break;
    }
  }
  const adjust = (hex: string, factor: number) => {
    const h = hex.startsWith("#") ? hex.slice(1) : hex;
    const n = parseInt(h, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    const lerp = (v: number) =>
      Math.min(
        255,
        Math.max(
          0,
          Math.round(v + (factor > 0 ? (255 - v) * factor : v * factor)),
        ),
      );
    return (
      "#" +
      [lerp(r), lerp(g), lerp(b)]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("")
    );
  };
  if (!secondary && primary) secondary = adjust(primary, 0.35);
  if (!accent && primary) accent = adjust(primary, -0.35);
  return { primary, secondary, accent, palette };
}

export type TeamPaletteResult = TeamPaletteCacheEntry;

/**
 * React hook: extract (and cache) a team logo color palette (primary, secondary, accent, raw unique list).
 * Safe for SSR (no-op until client). Caches per logoUrl to avoid recomputation.
 * @param logoUrl Logo image URL
 * @returns Palette result { primary, secondary, accent, palette }
 */
export function useTeamPalette(logoUrl?: string | null): TeamPaletteResult {
  const [state, setState] = useState<TeamPaletteResult>(() =>
    logoUrl && paletteCache.has(logoUrl)
      ? paletteCache.get(logoUrl)!
      : { primary: null, secondary: null, accent: null, palette: [] },
  );

  useEffect(() => {
    if (!logoUrl) return;
    if (paletteCache.has(logoUrl)) {
      setState(paletteCache.get(logoUrl)!);
      return;
    }
    if (typeof window === "undefined") return; // SSR guard
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.src = logoUrl;
    img.onload = () => {
      if (cancelled) return;
      const buckets = extractRawBuckets(img);
      if (buckets?.length) {
        const palette = bucketsToPalette(buckets);
        const derived = derivePalette(palette, buckets);
        paletteCache.set(logoUrl, derived);
        if (derived.primary) colorCache.set(logoUrl, derived.primary);
        setState(derived);
      }
    };
    return () => {
      cancelled = true;
    };
  }, [logoUrl]);

  return state;
}

// Backwards-compatible primary color hook
/**
 * React hook returning only the primary extracted team color (wrapper around useTeamPalette).
 * @param logoUrl Logo image URL
 * @returns Primary hex color or null
 */
export function useTeamColor(logoUrl?: string | null): string | null {
  const { primary } = useTeamPalette(logoUrl);
  return primary;
}

/**
 * Lighten a hex color toward white by an amount 0-1.
 * @param hex #RRGGBB color
 * @param amt Lighten factor (default 0.7)
 * @returns Lightened hex color
 */
export function lighten(hex: string, amt = 0.7): string {
  if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const h = hex.startsWith("#") ? hex.slice(1) : hex;
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lr = Math.round(r + (255 - r) * amt);
  const lg = Math.round(g + (255 - g) * amt);
  const lb = Math.round(b + (255 - b) * amt);
  return (
    "#" + [lr, lg, lb].map((v) => v.toString(16).padStart(2, "0")).join("")
  );
}

/**
 * Pick an accessible text color (dark slate vs white) for a given background hex.
 * @param hex #RRGGBB color
 * @returns '#1e293b' (dark) or '#ffffff'
 */
export function readableText(hex: string): string {
  if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) return "#1e293b";
  const h = hex.startsWith("#") ? hex.slice(1) : hex;
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b; // WCAG relative luminance weights approximation
  return lum > 155 ? "#1e293b" : "#ffffff";
}
