export type AppRole = "viewer" | "owner" | "commissioner";

export type UserStatus = "active" | "disabled";

export interface AuthUser {
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
}

export interface AuthOwnerOption {
  id: string;
  firstName: string;
  lastName: string;
  nickName: string;
  isActive: boolean;
}

export interface SignInPageProps {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}
