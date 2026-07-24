import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { env } from "./src/env";
import {
  getAuthUserByGoogleSubject,
  upsertGoogleUser,
} from "./src/lib/auth/user-store";
import type { AppRole, UserStatus } from "@gshl-types";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  providers: [
    Google({
      clientId: env.AUTH_GOOGLE_ID ?? "",
      clientSecret: env.AUTH_GOOGLE_SECRET ?? "",
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (
        account?.provider !== "google" ||
        !account.providerAccountId ||
        profile?.email_verified !== true ||
        typeof profile.email !== "string"
      ) {
        return false;
      }

      const appUser = await upsertGoogleUser({
        googleSubject: account.providerAccountId,
        email: profile.email,
        name: typeof profile.name === "string" ? profile.name : undefined,
        image:
          typeof profile.picture === "string" ? profile.picture : undefined,
      });
      return appUser.status === "active";
    },
    async jwt({ token, account }) {
      const googleSubject = account?.providerAccountId ?? token.googleSubject;
      if (typeof googleSubject !== "string") return token;

      const appUser = await getAuthUserByGoogleSubject(googleSubject);
      if (!appUser) return token;

      token.googleSubject = googleSubject;
      token.appUserId = appUser.id;
      token.role = appUser.role;
      token.ownerId = appUser.ownerId;
      token.status = appUser.status;
      token.name = appUser.name ?? token.name;
      token.email = appUser.email;
      token.picture = appUser.image ?? token.picture;
      return token;
    },
    session({ session, token }) {
      if (
        session.user &&
        typeof token.appUserId === "string" &&
        typeof token.role === "string" &&
        typeof token.status === "string"
      ) {
        session.user.id = token.appUserId;
        session.user.role = token.role as AppRole;
        session.user.ownerId =
          typeof token.ownerId === "string" ? token.ownerId : undefined;
        session.user.status = token.status as UserStatus;
      }
      return session;
    },
    authorized({ auth: session, request }) {
      const isProtected = ["/lockerroom", "/draftboard", "/leagueoffice"].some(
        (path) => request.nextUrl.pathname.startsWith(path),
      );
      if (!isProtected) return true;
      return session?.user?.status === "active";
    },
  },
});
