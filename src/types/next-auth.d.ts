import type { DefaultSession } from "next-auth";
import type { AppRole, UserStatus } from "@gshl-lib/auth/types";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: AppRole;
      ownerId?: string;
      status: UserStatus;
    };
  }

  interface User {
    role?: AppRole;
    ownerId?: string;
    status?: UserStatus;
    googleSubject?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    appUserId?: string;
    googleSubject?: string;
    role?: AppRole;
    ownerId?: string;
    status?: UserStatus;
  }
}
