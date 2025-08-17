import type { ToggleItem } from "@gshl-types";

export interface DraftBoardToolbarProps {
  toolbarKeys: ToggleItem<string | null>[];
  activeKey: string | null;
  className?: [string?, string?, string?];
}
