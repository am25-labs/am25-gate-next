import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyOptions } from "jose";

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJWKS(issuer: string): ReturnType<typeof createRemoteJWKSet> {
  const jwksUri = `${issuer.replace(/\/$/, "")}/.well-known/jwks.json`;

  if (!jwksCache.has(jwksUri)) {
    jwksCache.set(jwksUri, createRemoteJWKSet(new URL(jwksUri)));
  }

  return jwksCache.get(jwksUri)!;
}

export async function verifyTokenWithJWKS(
  token: string,
  issuer: string,
  expectedTyp?: string,
  options: Omit<JWTVerifyOptions, "issuer"> = {},
): Promise<JWTPayload> {
  const JWKS = getJWKS(issuer);
  const { payload, protectedHeader } = await jwtVerify(token, JWKS, {
    ...options,
    issuer: issuer.replace(/\/$/, ""),
  });
  if (expectedTyp && protectedHeader.typ !== expectedTyp) {
    throw new Error(
      `Expected token type ${expectedTyp}, got ${protectedHeader.typ}`,
    );
  }
  return payload;
}

export function clearJWKSCache(issuer?: string): void {
  if (issuer) {
    const jwksUri = `${issuer.replace(/\/$/, "")}/.well-known/jwks.json`;
    jwksCache.delete(jwksUri);
  } else {
    jwksCache.clear();
  }
}
