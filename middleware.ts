export { auth as middleware } from "./auth";

export const config = {
  matcher: [
    "/notifications/:path*",
    "/lockerroom/:path*",
    "/draft/:path*",
    "/draftboard/:path*",
    "/leagueoffice/:path*",
    "/admin/:path*",
  ],
};
