import { type NextRequest, NextResponse } from "next/server";
import { verifyTokenWithJWKS } from "./lib/jwks.js";

export interface GateProxyOptions {
  issuer: string;
  cookieName?: string;
  protectedPaths?: string[];
  publicPaths?: string[];
  clientId: string;
  redirectUri: string;
  scopes?: string[];
}

export function createGateProxy(options: GateProxyOptions) {
  const {
    issuer,
    cookieName = "am25_sess",
    protectedPaths = ["/dashboard"],
    publicPaths = [],
    clientId,
    redirectUri,
    scopes = ["openid", "profile", "email", "users"],
  } = options;

  if (!issuer) throw new Error("issuer is required");
  if (!clientId) throw new Error("clientId is required");
  if (!redirectUri) throw new Error("redirectUri is required");

  return async function gateProxy(request: NextRequest): Promise<NextResponse | null> {
    const { pathname } = request.nextUrl;

    const isPublic = publicPaths.some(
      (path) => pathname === path || pathname.startsWith(path + "/"),
    );
    if (isPublic) return null;

    const isProtected = protectedPaths.some(
      (path) => pathname === path || pathname.startsWith(path + "/"),
    );
    if (!isProtected) return null;

    const token = request.cookies.get(cookieName)?.value;

    if (!token) {
      return redirectToLogin(request, issuer, clientId, redirectUri, scopes);
    }

    try {
      await verifyTokenWithJWKS(token, issuer, "st+jwt");
    } catch {
      return redirectToLogin(request, issuer, clientId, redirectUri, scopes);
    }

    try {
      const sessionRes = await fetch(
        `${issuer.replace(/\/$/, "")}/api/auth/session?client_id=${encodeURIComponent(clientId)}`,
        { headers: { Cookie: `${cookieName}=${token}` }, cache: "no-store" },
      );

      if (sessionRes.status === 403) {
        return NextResponse.redirect(new URL("/unauthorized", issuer));
      }
    } catch {
      // Gate unreachable — fail open, JWT is already verified
    }

    return null;
  };
}

function redirectToLogin(
  request: NextRequest,
  issuer: string,
  clientId: string,
  redirectUri: string,
  scopes: string[],
): NextResponse {
  const returnTo = request.nextUrl.pathname + request.nextUrl.search;
  const state = Buffer.from(JSON.stringify({ returnTo })).toString("base64url");

  const authUrl = new URL("/oauth/authorize", issuer);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl);
}

export { createGateProxy as gateProxy };
