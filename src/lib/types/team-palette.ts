export interface TeamPaletteCacheEntry {
  primary: string | null;
  secondary: string | null;
  accent: string | null;
  palette: string[];
}

export interface Bucket {
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

export type TeamPaletteResult = TeamPaletteCacheEntry;
