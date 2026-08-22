"use client";

import Image from "next/image";
import { useState } from "react";
import type { NHLLogoProps } from "@gshl-types";
import { cn } from "@gshl-utils";

export function NHLLogo({ team, size = 18, className }: NHLLogoProps) {
  const [erroredUrl, setErroredUrl] = useState<string | null>(null);

  if (!team?.logoUrl || erroredUrl === team.logoUrl) {
    return (
      <span
        aria-label="NHL team logo unavailable"
        className={cn("inline-block", className)}
        role="img"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <Image
      src={team.logoUrl}
      className={cn("mx-auto object-contain", className)}
      style={{ width: size, height: size }}
      alt={`${team.name} logo`}
      width={size}
      height={size}
      onError={() => setErroredUrl(team.logoUrl)}
    />
  );
}
