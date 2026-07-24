import type { AuthConfig } from "convex/server";

const issuer = process.env.CONVEX_AUTH_ISSUER;
if (!issuer) throw new Error("CONVEX_AUTH_ISSUER is required");

export default {
  providers: [
    {
      type: "customJwt",
      applicationID: "gshl",
      issuer,
      jwks: `${issuer.replace(/\/$/, "")}/api/convex/jwks`,
      algorithm: "RS256",
    },
  ],
} satisfies AuthConfig;
