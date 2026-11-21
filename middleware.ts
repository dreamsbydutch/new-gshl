export { auth as middleware } from "./auth";

export const config = {
  matcher: [
    "/notifications/:path*",
    "/draft/:path*",
    "/draftboard/:path*",
    "/leagueoffice/:path*",
    "/admin/:path*",
  ],
};
