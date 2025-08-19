"use client";

/**
 * Toggle Components
 *
 * Reusable toggle components for navigation interfaces with custom rendering
 * support, loading states, and accessibility features.
 */

import { type ReactNode, useState, useRef, useEffect } from "react";
import { cn } from "@gshl-utils";

interface BaseToggleProps<T> {
  items: T[];
  selectedItem?: T | null;
  onSelect: (item: T) => void;
  getItemKey?: (item: T) => string;
  getItemLabel?: (item: T) => string;
  getItemDescription?: (item: T) => string | undefined;
  renderCustomItem?: (item: T, isSelected: boolean) => ReactNode;
  loading?: boolean;
  error?: string | null;
  className?: string;
}

interface HorizontalToggleProps<T> extends BaseToggleProps<T> {
  itemClassName?: string;
}

interface DropdownToggleProps<T> extends BaseToggleProps<T> {
  renderSelectedItem?: (item: T) => ReactNode;
  buttonClassName?: string;
  dropdownClassName?: string;
  placeholder?: string;
  maxHeight?: string;
  dropdownPosition?: "above" | "below" | "auto";
}

/**
 * Horizontal toggle component with scrollable item selector
 * @param props - Component props
 * @returns Horizontal scrollable toggle interface
 */
export function HorizontalToggle<T>({
  items,
  selectedItem,
  onSelect,
  getItemKey = (item: T) => String(item),
  getItemLabel = (item: T) => String(item),
  getItemDescription,
  renderCustomItem,
  loading = false,
  error = null,
  className,
  itemClassName,
}: HorizontalToggleProps<T>) {
  if (loading) {
    return (
      <div className={cn("animate-pulse", className)}>
        <div className="flex space-x-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 w-16 rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("text-sm text-destructive", className)}>
        Error: {error}
      </div>
    );
  }

  if (!items?.length) {
    return (
      <div className={cn("text-sm text-muted-foreground", className)}>
        No items available
      </div>
    );
  }

  return (
    <div
      className={cn(
        "no-scrollbar flex flex-row gap-1 overflow-x-auto overflow-y-hidden whitespace-nowrap",
        className,
      )}
    >
      {items.map((item) => {
        const key = getItemKey(item);
        const isSelected = selectedItem === item;
        const label = getItemLabel(item);
        const description = getItemDescription?.(item);

        if (renderCustomItem) {
          return (
            <div
              key={key}
              onClick={() => onSelect(item)}
              className={cn(
                "flex-shrink-0 cursor-pointer rounded-md transition-colors",
                isSelected ? "bg-primary" : "bg-white",
              )}
            >
              {renderCustomItem(item, isSelected)}
            </div>
          );
        }

        return (
          <button
            key={key}
            onClick={() => onSelect(item)}
            className={cn(
              "rounded px-3 py-1 text-sm transition-colors",
              isSelected
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/80",
              itemClassName,
            )}
            title={description}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Dropdown toggle component with intelligent positioning
 * @param props - Component props
 * @returns Dropdown toggle interface with positioning logic
 */
export function DropdownToggle<T>({
  items,
  selectedItem,
  onSelect,
  getItemKey = (item: T) => String(item),
  getItemLabel = (item: T) => String(item),
  getItemDescription,
  renderCustomItem,
  renderSelectedItem,
  loading = false,
  error = null,
  className,
  buttonClassName,
  dropdownClassName,
  placeholder = "Select an option",
  maxHeight = "200px",
  dropdownPosition = "auto",
}: DropdownToggleProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [shouldOpenAbove, setShouldOpenAbove] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen]);

  useEffect(() => {
    if (dropdownPosition === "auto" && isOpen && buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - buttonRect.bottom;
      const spaceAbove = buttonRect.top;
      const dropdownHeight = parseInt(maxHeight, 10) || 200;

      setShouldOpenAbove(
        spaceBelow < dropdownHeight && spaceAbove > dropdownHeight,
      );
    } else {
      setShouldOpenAbove(dropdownPosition === "above");
    }
  }, [isOpen, dropdownPosition, maxHeight]);

  const handleSelect = (item: T) => {
    onSelect(item);
    setIsOpen(false);
  };

  const toggleDropdown = () => {
    if (!loading && !error && items?.length) {
      setIsOpen(!isOpen);
    }
  };

  if (loading) {
    return (
      <div className={cn("animate-pulse", className)}>
        <div className="h-8 w-32 rounded bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("text-sm text-destructive", className)}>
        Error: {error}
      </div>
    );
  }

  const selectedLabel = selectedItem
    ? renderSelectedItem
      ? renderSelectedItem(selectedItem)
      : getItemLabel(selectedItem)
    : placeholder;

  return (
    <div className={cn("relative mx-2", className)}>
      <button
        ref={buttonRef}
        onClick={toggleDropdown}
        disabled={!items?.length}
        className={cn(
          "flex w-full items-center justify-between rounded border bg-slate-100 px-2 py-1 text-sm transition-colors",
          "hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          !items?.length && "cursor-not-allowed opacity-50",
          buttonClassName,
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="truncate">
          {typeof selectedLabel === "string" ? selectedLabel : selectedLabel}
        </span>

        <svg
          className={cn(
            "ml-2 h-4 w-4 transition-transform",
            isOpen && shouldOpenAbove ? "rotate-0" : isOpen && "rotate-180",
          )}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && items?.length && (
        <div
          ref={dropdownRef}
          className={cn(
            "absolute z-50 w-full rounded border bg-popover shadow-lg",
            shouldOpenAbove ? "bottom-full mb-1" : "top-full mt-1",
            dropdownClassName,
          )}
          style={{ maxHeight }}
        >
          <div
            className="overflow-y-auto p-1"
            style={{ maxHeight: `calc(${maxHeight} - 8px)` }}
          >
            {items.map((item) => {
              const key = getItemKey(item);
              const isSelected = selectedItem === item;
              const label = getItemLabel(item);
              const description = getItemDescription?.(item);

              if (renderCustomItem) {
                return (
                  <div
                    key={key}
                    onClick={() => handleSelect(item)}
                    className="cursor-pointer"
                    role="option"
                    aria-selected={isSelected}
                  >
                    {renderCustomItem(item, isSelected)}
                  </div>
                );
              }

              return (
                <button
                  key={key}
                  onClick={() => handleSelect(item)}
                  className={cn(
                    "w-full rounded px-3 py-2 text-left text-sm transition-colors",
                    "hover:bg-muted focus:bg-muted focus:outline-none",
                    isSelected && "bg-primary text-primary-foreground",
                  )}
                  title={description}
                  role="option"
                  aria-selected={isSelected}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
