import React from "react";

/**
 * DraftBoardLayout
 *
 * Layout component for the Draft Board feature page.
 * Wraps all draft board content and applies consistent styling.
 *
 * @param {React.ReactNode} children - Nested page content.
 * @returns {JSX.Element} Layout wrapper for draft board.
 */

export default function DraftBoardLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">{children}</div>
  );
}
