"use client";
import { useNHLResource } from "./useNHL";
import {
  nhlOrganizationsSchema,
  NHL_ORGANIZATION_REFRESH_SECONDS,
} from "../../lib/utils/features/nhl-organizations";

export function useNhlOrganizations(seasonStartYear: number | null) {
  return useNHLResource(
    seasonStartYear === null
      ? null
      : `/api/nhl/organizations?season=${seasonStartYear * 10000 + seasonStartYear + 1}`,
    nhlOrganizationsSchema,
    NHL_ORGANIZATION_REFRESH_SECONDS,
  );
}
