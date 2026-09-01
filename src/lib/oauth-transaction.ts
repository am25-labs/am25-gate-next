import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

const transactionCookiePrefix = "am25_oauth_";
const transactionMaxAge = 10 * 60;
const statePattern = /^[A-Za-z0-9_-]{43}$/;

export interface AuthorizationRequestOptions {
  issuer: string;
  clientId: string;
  redirectUri: string;
  scopes?: string[];
  defaultRedirect?: string;
}

export interface OAuthTransaction {
  state: string;
  codeVerifier: string;
  nonce: string;
  returnTo: string;
  expectsIdToken: boolean;
}

function randomValue() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
    "base64url",
  );
}

async function createCodeChallenge(codeVerifier: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier),
  );
  return Buffer.from(digest).toString("base64url");
}

function cookieName(state: string) {
  const prefix = process.env.NODE_ENV === "production" ? "__Host-" : "";
  return `${prefix}${transactionCookiePrefix}${state}`;
}

function transactionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

function encodeTransaction(transaction: OAuthTransaction) {
  return Buffer.from(JSON.stringify(transaction)).toString("base64url");
}

function decodeTransaction(value: string): OAuthTransaction | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString()) as {
      state?: unknown;
      codeVerifier?: unknown;
      nonce?: unknown;
      returnTo?: unknown;
      expectsIdToken?: unknown;
    };

    if (
      typeof parsed.state !== "string" ||
      !statePattern.test(parsed.state) ||
      typeof parsed.codeVerifier !== "string" ||
      !statePattern.test(parsed.codeVerifier) ||
      typeof parsed.nonce !== "string" ||
      !statePattern.test(parsed.nonce) ||
      typeof parsed.returnTo !== "string" ||
      typeof parsed.expectsIdToken !== "boolean"
    ) {
      return null;
    }

    return parsed as OAuthTransaction;
  } catch {
    return null;
  }
}

function safeRelativeUrl(value: string, appOrigin: string) {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return null;
  }

  try {
    const url = new URL(value, appOrigin);
    if (url.origin !== appOrigin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function normalizeReturnTo(
  value: string | null | undefined,
  appOrigin: string,
  fallback: string,
) {
  const safeFallback = safeRelativeUrl(fallback, appOrigin);
  if (!safeFallback) throw new Error("defaultRedirect must be a local path");
  if (!value) return safeFallback;
  return safeRelativeUrl(value, appOrigin) ?? safeFallback;
}

export function readOAuthTransaction(
  request: NextRequest,
  state: string | null,
) {
  if (!state || !statePattern.test(state)) return null;

  const value = request.cookies.get(cookieName(state))?.value;
  if (!value) return null;

  const transaction = decodeTransaction(value);
  if (!transaction) return null;

  const provided = Buffer.from(state);
  const expected = Buffer.from(transaction.state);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return null;
  }

  return transaction;
}

export function clearOAuthTransaction(
  response: NextResponse,
  state: string | null,
) {
  if (!state || !statePattern.test(state)) return response;
  response.cookies.set(cookieName(state), "", transactionCookieOptions(0));
  return response;
}

export async function createAuthorizationResponse(
  options: AuthorizationRequestOptions,
  returnTo?: string | null,
) {
  const {
    issuer,
    clientId,
    redirectUri,
    scopes = ["openid", "profile", "email", "users"],
    defaultRedirect = "/dashboard",
  } = options;

  if (!issuer) throw new Error("issuer is required");
  if (!clientId) throw new Error("clientId is required");
  if (!redirectUri) throw new Error("redirectUri is required");

  const appOrigin = new URL(redirectUri).origin;
  const state = randomValue();
  const codeVerifier = randomValue();
  const nonce = randomValue();
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const transaction: OAuthTransaction = {
    state,
    codeVerifier,
    nonce,
    returnTo: normalizeReturnTo(returnTo, appOrigin, defaultRedirect),
    expectsIdToken: scopes.includes("openid"),
  };

  const authUrl = new URL("/oauth/authorize", issuer.replace(/\/$/, ""));
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(
    cookieName(state),
    encodeTransaction(transaction),
    transactionCookieOptions(transactionMaxAge),
  );
  return response;
}
