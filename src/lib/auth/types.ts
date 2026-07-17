export const APP_ROLES = ["viewer", "owner", "commissioner"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const USER_STATUSES = ["active", "disabled"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export type AuthUser = {
  id: string;
  googleSubject: string;
  email: string;
  name?: string;
  image?: string;
  role: AppRole;
  ownerId?: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
};

export type AuthOwnerOption = {
  id: string;
  firstName: string;
  lastName: string;
  nickName: string;
  isActive: boolean;
};

export type SignInPageProps = {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
};

export function isCommissioner(role: AppRole | undefined): boolean {
  return role === "commissioner";
}

export function canManageOwnTeam(role: AppRole | undefined): boolean {
  return role === "owner" || role === "commissioner";
}
