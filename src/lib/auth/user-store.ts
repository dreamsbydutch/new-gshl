import { callConvex } from "@gshl-lib/data/convex-store";
import type { AppRole, AuthUser, UserStatus } from "@gshl-types";

export async function upsertGoogleUser(input: {
  googleSubject: string;
  email: string;
  name?: string;
  image?: string;
}): Promise<AuthUser> {
  return callConvex<AuthUser>("mutation", "authUsers:upsertGoogleUser", input);
}

export async function getAuthUserByGoogleSubject(
  googleSubject: string,
): Promise<AuthUser | null> {
  return callConvex<AuthUser | null>("query", "authUsers:byGoogleSubject", {
    googleSubject,
  });
}

export async function listAuthUsers(): Promise<AuthUser[]> {
  return callConvex<AuthUser[]>("query", "authUsers:list", {});
}

export async function updateAuthUserAccess(input: {
  id: string;
  role: AppRole;
  status: UserStatus;
  ownerId?: string;
}): Promise<AuthUser> {
  return callConvex<AuthUser>("mutation", "authUsers:updateAccess", input);
}
