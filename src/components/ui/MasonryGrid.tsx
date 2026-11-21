"use client";

import { Children, isValidElement, type ReactNode } from "react";
import { useMasonryLayout } from "@gshl-hooks/features/useMasonryLayout";

export function MasonryGrid({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useMasonryLayout();
  return (
    <div ref={ref} className={`gshl-masonry ${className}`}>
      {Children.toArray(children).map((child, index) => (
        <div
          key={isValidElement(child) ? child.key : index}
          className="gshl-masonry-item"
        >
          <div className="gshl-masonry-content">{child}</div>
        </div>
      ))}
    </div>
  );
}
