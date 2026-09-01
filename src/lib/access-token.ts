import type { JWTPayload } from "jose";
import { verifyTokenWithJWKS } from "./jwks.js";

export interface ActiveAccessTokenOptions {
  issuer: string;
  clientId: string;
}

export async function verifyActiveAccessToken(
  token: string,
  { issuer, clientId }: ActiveAccessTokenOptions,
): Promise<JWTPayload> {
  const normalizedIssuer = issuer.replace(/\/$/, "");
  const payload = await verifyTokenWithJWKS(token, normalizedIssuer, "at+jwt", {
    audience: clientId,
  });

  const response = await fetch(`${normalizedIssuer}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Gate rejected the access token");
  }

  const currentClaims = (await response.json()) as JWTPayload;
  if (currentClaims.sub !== payload.sub) {
    throw new Error("Gate returned a different subject");
  }

  return {
    ...payload,
    ...currentClaims,
    sub: payload.sub,
  };
}
