import type { ReactNode } from "react";

export interface RulebookSection {
  id: string;
  title: string;
  content: ReactNode;
  keywords?: string[];
}

export interface RulebookItem {
  code: string;
  text: string;
  subitems?: RulebookItem[];
}
