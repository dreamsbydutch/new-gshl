import { useEffect, useState } from "react";

// Cache extracted colors per logo URL to avoid recomputation.
const colorCache = new Map<string, string>();

function extractDominantColor(img: HTMLImageElement): string | null {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const w = (canvas.width = img.naturalWidth || img.width);
    const h = (canvas.height = img.naturalHeight || img.height);
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    let r = 0,
      g = 0,
      b = 0,
      count = 0;
    const total = data.length / 4;
    const stride = Math.max(1, Math.floor(total / 6000)); // sample up to ~6k pixels
    for (let p = 0; p < total; p += stride) {
      const i = p * 4;
      if (i + 3 >= data.length) break; // safety guard
      const a = data[i + 3] ?? 0;
      if (a < 180) continue; // skip mostly transparent
      r += data[i] ?? 0;
      g += data[i + 1] ?? 0;
      b += data[i + 2] ?? 0;
      count++;
    }
    if (!count) return null;
    r = Math.round(r / count);
    g = Math.round(g / count);
    b = Math.round(b / count);
    return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  } catch {
    return null; // likely CORS taint
  }
}

export function useTeamColor(logoUrl?: string | null): string | null {
  const [color, setColor] = useState<string | null>(() =>
    logoUrl ? (colorCache.get(logoUrl) ?? null) : null,
  );

  useEffect(() => {
    if (!logoUrl) return;
    if (colorCache.has(logoUrl)) {
      setColor(colorCache.get(logoUrl) ?? null);
      return;
    }
    if (typeof window === "undefined") return; // SSR: skip
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.src = logoUrl;
    img.onload = () => {
      if (cancelled) return;
      const hex = extractDominantColor(img);
      if (hex) {
        colorCache.set(logoUrl, hex);
        setColor(hex);
      }
    };
    return () => {
      cancelled = true;
    };
  }, [logoUrl]);

  return color;
}

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

export function readableText(hex: string): string {
  if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) return "#1e293b";
  const h = hex.startsWith("#") ? hex.slice(1) : hex;
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b; // WCAG relative luminance weights approximation
  // Slightly higher threshold so very light pastels choose dark text
  return lum > 155 ? "#1e293b" : "#ffffff";
}
