"use client";

import Image from "next/image";
import { useState } from "react";
import type { NHLLogoProps } from "@gshl-types";
import { cn, resolveNhlTeamLogoUrl } from "@gshl-utils";
import type { StaticImageData } from "next/image";
import logo0 from "../../../public/nhl-logos/anaheim-ducks.png";
import logo1 from "../../../public/nhl-logos/arizona-coyotes.png";
import logo2 from "../../../public/nhl-logos/boston-bruins.png";
import logo3 from "../../../public/nhl-logos/buffalo-sabres.png";
import logo4 from "../../../public/nhl-logos/calgary-flames.png";
import logo5 from "../../../public/nhl-logos/carolina-hurricanes.png";
import logo6 from "../../../public/nhl-logos/chicago-blackhawks.png";
import logo7 from "../../../public/nhl-logos/colorado-avalanche.png";
import logo8 from "../../../public/nhl-logos/columbus-blue-jackets.png";
import logo9 from "../../../public/nhl-logos/dallas-stars.png";
import logo10 from "../../../public/nhl-logos/detroit-red-wings.png";
import logo11 from "../../../public/nhl-logos/edmonton-oilers.png";
import logo12 from "../../../public/nhl-logos/florida-panthers.png";
import logo13 from "../../../public/nhl-logos/los-angeles-kings.png";
import logo14 from "../../../public/nhl-logos/minnesota-wild.png";
import logo15 from "../../../public/nhl-logos/montreal-canadiens.png";
import logo16 from "../../../public/nhl-logos/nashville-predators.png";
import logo17 from "../../../public/nhl-logos/new-jersey-devils.png";
import logo18 from "../../../public/nhl-logos/new-york-islanders.png";
import logo19 from "../../../public/nhl-logos/new-york-rangers.png";
import logo20 from "../../../public/nhl-logos/ottawa-senators.png";
import logo21 from "../../../public/nhl-logos/philadelphia-flyers.png";
import logo22 from "../../../public/nhl-logos/pittsburgh-penguins.png";
import logo23 from "../../../public/nhl-logos/san-jose-sharks.png";
import logo24 from "../../../public/nhl-logos/seattle-kraken.png";
import logo25 from "../../../public/nhl-logos/st-louis-blues.png";
import logo26 from "../../../public/nhl-logos/tampa-bay-lightning.png";
import logo27 from "../../../public/nhl-logos/toronto-maple-leafs.png";
import logo28 from "../../../public/nhl-logos/utah-mammoth.png";
import logo29 from "../../../public/nhl-logos/vancouver-canucks.png";
import logo30 from "../../../public/nhl-logos/vegas-golden-knights.png";
import logo31 from "../../../public/nhl-logos/washington-capitals.png";
import logo32 from "../../../public/nhl-logos/winnipeg-jets.png";

// Content hashes let optimized copies stay immutable. Replacing a source
// image automatically creates a new URL without delaying logo updates.
const localLogos: Record<string, StaticImageData> = {
  "/nhl-logos/anaheim-ducks.png": logo0,
  "/nhl-logos/arizona-coyotes.png": logo1,
  "/nhl-logos/boston-bruins.png": logo2,
  "/nhl-logos/buffalo-sabres.png": logo3,
  "/nhl-logos/calgary-flames.png": logo4,
  "/nhl-logos/carolina-hurricanes.png": logo5,
  "/nhl-logos/chicago-blackhawks.png": logo6,
  "/nhl-logos/colorado-avalanche.png": logo7,
  "/nhl-logos/columbus-blue-jackets.png": logo8,
  "/nhl-logos/dallas-stars.png": logo9,
  "/nhl-logos/detroit-red-wings.png": logo10,
  "/nhl-logos/edmonton-oilers.png": logo11,
  "/nhl-logos/florida-panthers.png": logo12,
  "/nhl-logos/los-angeles-kings.png": logo13,
  "/nhl-logos/minnesota-wild.png": logo14,
  "/nhl-logos/montreal-canadiens.png": logo15,
  "/nhl-logos/nashville-predators.png": logo16,
  "/nhl-logos/new-jersey-devils.png": logo17,
  "/nhl-logos/new-york-islanders.png": logo18,
  "/nhl-logos/new-york-rangers.png": logo19,
  "/nhl-logos/ottawa-senators.png": logo20,
  "/nhl-logos/philadelphia-flyers.png": logo21,
  "/nhl-logos/pittsburgh-penguins.png": logo22,
  "/nhl-logos/san-jose-sharks.png": logo23,
  "/nhl-logos/seattle-kraken.png": logo24,
  "/nhl-logos/st-louis-blues.png": logo25,
  "/nhl-logos/tampa-bay-lightning.png": logo26,
  "/nhl-logos/toronto-maple-leafs.png": logo27,
  "/nhl-logos/utah-mammoth.png": logo28,
  "/nhl-logos/vancouver-canucks.png": logo29,
  "/nhl-logos/vegas-golden-knights.png": logo30,
  "/nhl-logos/washington-capitals.png": logo31,
  "/nhl-logos/winnipeg-jets.png": logo32,
};

export function NHLLogo({ team, size = 18, className }: NHLLogoProps) {
  const [erroredUrl, setErroredUrl] = useState<string | null>(null);
  const logoUrl = team ? resolveNhlTeamLogoUrl(team) : null;

  if (!team || !logoUrl || erroredUrl === logoUrl) {
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
      src={localLogos[logoUrl] ?? logoUrl}
      className={cn("mx-auto object-contain", className)}
      style={{ width: size, height: size }}
      alt={`${team.name} logo`}
      width={size}
      height={size}
      onError={() => setErroredUrl(logoUrl)}
    />
  );
}
