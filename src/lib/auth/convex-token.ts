import "server-only";

import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { env } from "@gshl-env";

const APPLICATION_ID = "gshl";

function encode(value: string | Buffer) {
  return (typeof value === "string" ? Buffer.from(value) : value).toString(
    "base64url",
  );
}

function privateKey() {
  const value = env.CONVEX_AUTH_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!value) throw new Error("CONVEX_AUTH_PRIVATE_KEY is required");
  return createPrivateKey(value);
}

function issuer() {
  const value = env.CONVEX_AUTH_ISSUER?.replace(/\/$/, "");
  if (!value) throw new Error("CONVEX_AUTH_ISSUER is required");
  return value;
}

export function createConvexAccessToken(subject: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = encode(
    JSON.stringify({
      alg: "RS256",
      kid: env.CONVEX_AUTH_KEY_ID,
      typ: "JWT",
    }),
  );
  const payload = encode(
    JSON.stringify({
      sub: subject,
      iss: issuer(),
      aud: APPLICATION_ID,
      iat: now,
      exp: now + 60 * 60,
    }),
  );
  const input = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(input), privateKey());
  return `${input}.${encode(signature)}`;
}

export function getConvexJwks() {
  const publicKey = createPublicKey(privateKey()).export({
    format: "jwk",
  });
  return {
    keys: [
      {
        ...publicKey,
        alg: "RS256",
        kid: env.CONVEX_AUTH_KEY_ID,
        use: "sig",
      },
    ],
  };
}
