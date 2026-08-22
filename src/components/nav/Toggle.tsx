"use client";

/**
 * Toggle Components
 *
 * Reusable toggle components for navigation interfaces with custom rendering
 * support, loading states, and accessibility features.
 */

import { useRef, useEffect } from "react";
import { cn } from "@gshl-utils";
import type { DropdownToggleProps, HorizontalToggleProps } from "@gshl-types";
import { Skeleton } from "@gshl-ui";

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
  const selectedItemRef = useRef<HTMLButtonElement>(null);
  const selectedItemKey = selectedItem ? getItemKey(selectedItem) : null;

  useEffect(() => {
    selectedItemRef.current?.scrollIntoView({
      block: "nearest",
      inline: "center",
    });
  }, [selectedItemKey]);

  if (loading) {
    return (
      <div className={className}>
        <div className="flex space-x-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-16 rounded" />
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
        "no-scrollbar mx-auto flex flex-row gap-1 overflow-x-auto overflow-y-hidden whitespace-nowrap",
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
            <button
              type="button"
              key={key}
              ref={isSelected ? selectedItemRef : undefined}
              onClick={() => onSelect(item)}
              aria-pressed={isSelected}
              aria-label={label}
              title={description}
              className={cn(
                "flex min-h-9 min-w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-1 motion-reduce:transition-none",
                isSelected
                  ? "bg-slate-200 ring-1 ring-slate-400"
                  : "bg-transparent hover:bg-slate-100",
              )}
            >
              {renderCustomItem(item, isSelected)}
            </button>
          );
        }

        return (
          <button
            type="button"
            key={key}
            ref={isSelected ? selectedItemRef : undefined}
            onClick={() => onSelect(item)}
            aria-pressed={isSelected}
            className={cn(
              "min-h-9 rounded px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-1 motion-reduce:transition-none",
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
 * Native dropdown selector with platform keyboard and assistive-technology behavior
 * @param props - Component props
 * @returns Labelled native select interface
 */
export function DropdownToggle<T>({
  items,
  selectedItem,
  onSelect,
  getItemKey = (item: T) => String(item),
  getItemLabel = (item: T) => String(item),
  loading = false,
  error = null,
  className,
  buttonClassName,
  ariaLabel = "Select an option",
  placeholder = "Select an option",
}: DropdownToggleProps<T>) {
  if (loading) {
    return (
      <div className={className}>
        <Skeleton className="h-8 w-32 rounded" />
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

  const selectedKey = selectedItem != null ? getItemKey(selectedItem) : "";

  return (
    <div className={cn("relative mx-2", className)}>
      <select
        aria-label={ariaLabel}
        value={selectedKey}
        onChange={(event) => {
          const nextItem = items.find(
            (item) => getItemKey(item) === event.target.value,
          );
          if (nextItem) onSelect(nextItem);
        }}
        disabled={!items?.length}
        className={cn(
          "min-h-9 w-full rounded border bg-slate-100 px-2.5 py-1 pr-8 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 motion-reduce:transition-none",
          !items?.length && "cursor-not-allowed opacity-50",
          buttonClassName,
        )}
      >
        {selectedItem == null ? <option value="">{placeholder}</option> : null}
        {items.map((item) => (
          <option key={getItemKey(item)} value={getItemKey(item)}>
            {getItemLabel(item)}
          </option>
        ))}
      </select>
    </div>
  );
}
