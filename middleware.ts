export { auth as middleware } from "./auth";

export const config = {
  matcher: ["/lockerroom/:path*", "/draftboard/:path*", "/leagueoffice/:path*"],
};
