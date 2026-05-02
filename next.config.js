/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "qzcw4d2n1l.ufs.sh" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ], // replace with your image domain(s)
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Exclude Node.js-only modules from client-side bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        tls: false,
        net: false,
        dns: false,
        child_process: false,
        fs: false,
      };
    }
    return config;
  },
};

export default config;
