export { auth as middleware } from "./auth";

export const config = {
  matcher: [
    "/lockerroom/:path*",
    "/draft/:path*",
    "/draftboard/:path*",
    "/leagueoffice/:path*",
  ],
};
