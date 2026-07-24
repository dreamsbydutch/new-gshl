import type { AppRole } from "@gshl-types";

export function isCommissioner(role: AppRole | undefined): boolean {
  return role === "commissioner";
}

export function canManageOwnTeam(role: AppRole | undefined): boolean {
  return role === "owner" || role === "commissioner";
}
