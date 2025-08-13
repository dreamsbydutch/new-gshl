/**
 * @fileoverview Navigation Types
 *
 * Shared type definitions for all navigation components.
 * Provides consistent interfaces across the navigation system.
 *
 * @author GSHL Development Team
 */

import type { ReactNode } from "react";

// ============================================================================
// CORE NAVIGATION TYPES
// ============================================================================

/**
 * Base navigation item configuration
 */
export interface BaseNavItem {
  /** Unique identifier for the nav item */
  id: string;
  /** Display label or content */
  label: string;
  /** Optional icon URL or component */
  icon?: string | ReactNode;
  /** Whether the item is currently active */
  isActive?: boolean;
  /** Whether the item is disabled */
  isDisabled?: boolean;
  /** Custom CSS classes */
  className?: string;
}

/**
 * Navigation item with click handler
 */
export interface ClickableNavItem extends BaseNavItem {
  /** Click handler function */
  onClick: () => void;
}

/**
 * Navigation item with link
 */
export interface LinkNavItem extends BaseNavItem {
  /** Navigation href */
  href: string;
}

/**
 * Toggle item for dropdown/selection components
 */
export interface ToggleItem<T = string> {
  /** Unique key for the item */
  key: string;
  /** Display value */
  value: string;
  /** Data payload */
  data?: T;
  /** Setter function */
  setter: (value: T) => void;
}

// ============================================================================
// COMPONENT-SPECIFIC TYPES
// ============================================================================

/**
 * Main navigation bar configuration
 */
export interface NavbarConfig {
  /** Navigation items */
  items: LinkNavItem[];
  /** Custom container classes */
  containerClassName?: string;
  /** Custom item classes */
  itemClassName?: string;
}

/**
 * Secondary toolbar configuration
 */
export interface SecondaryToolbarConfig {
  /** Toolbar toggle items */
  toolbarKeys: ToggleItem[];
  /** Currently active key */
  activeKey: string | null;
  /** Custom CSS classes [container, content, item] */
  className?: [string?, string?, string?];
}

/**
 * Dropdown selector configuration
 */
export interface DropdownSelectorConfig<T = unknown> {
  /** Available options */
  options: T[];
  /** Selected option value */
  selectedValue: unknown;
  /** Selection change handler */
  onSelect: (value: T) => void;
  /** Option display formatter */
  displayFormatter: (option: T) => string;
  /** Option value getter */
  valueGetter: (option: T) => unknown;
  /** Custom CSS classes [trigger, content, item] */
  className?: [string?, string?, string?];
  /** Loading state */
  isLoading?: boolean;
  /** Error state */
  error?: Error | null;
}

/**
 * Horizontal toggle bar configuration
 */
export interface HorizontalToggleConfig<T = unknown> {
  /** Available items */
  items: T[];
  /** Selected item value */
  selectedValue: unknown;
  /** Selection change handler */
  onSelect: (value: T) => void;
  /** Item display formatter */
  displayFormatter: (item: T) => ReactNode;
  /** Item value getter */
  valueGetter: (item: T) => unknown;
  /** Item key getter */
  keyGetter: (item: T) => string;
  /** Custom CSS classes [container, content, item, activeItem] */
  className?: [string?, string?, string?, string?];
  /** Loading state */
  isLoading?: boolean;
  /** Error state */
  error?: Error | null;
}

// ============================================================================
// LAYOUT TYPES
// ============================================================================

/**
 * Navigation layout positions
 */
export type NavPosition = "top" | "bottom" | "left" | "right" | "secondary";

/**
 * Navigation container variant
 */
export type NavVariant = "primary" | "secondary" | "sidebar" | "floating";

/**
 * Navigation size variants
 */
export type NavSize = "sm" | "md" | "lg";
