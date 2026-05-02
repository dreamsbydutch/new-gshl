/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";
import type { NextConfig } from "next";

const config: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "qzcw4d2n1l.ufs.sh" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ], // replace with your image domain(s)
  },
  webpack: (
    webpackConfig: { resolve?: { fallback?: Record<string, boolean> } },
    { isServer }: { isServer: boolean },
  ) => {
    if (!isServer) {
      // Exclude Node.js-only modules from client-side bundle
      webpackConfig.resolve = {
        ...webpackConfig.resolve,
        fallback: {
          ...(webpackConfig.resolve?.fallback ?? {}),
          tls: false,
          net: false,
          dns: false,
          child_process: false,
          fs: false,
        },
      };
    }
    return webpackConfig;
  },
};

export default config;
