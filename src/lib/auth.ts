export interface LoginUrlOptions {
  issuer: string;
  clientId: string;
  redirectUri: string;
  scopes?: string[];
  returnTo?: string;
}

export interface LogoutUrlOptions {
  logoutEndpoint?: string;
  returnTo?: string;
}

export interface AuthConfigOptions {
  issuer: string;
  clientId: string;
  redirectUri: string;
  scopes?: string[];
}

export interface AuthConfig {
  getLoginUrl: (returnTo?: string) => string;
  getLogoutUrl: (returnTo?: string) => string;
  issuer: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
}

export function getLoginUrl(options: LoginUrlOptions): string {
  const {
    issuer,
    clientId,
    redirectUri,
    scopes = ["openid", "profile", "email", "users"],
    returnTo,
  } = options;

  if (!issuer) throw new Error("issuer is required");
  if (!clientId) throw new Error("clientId is required");
  if (!redirectUri) throw new Error("redirectUri is required");

  const authUrl = new URL("/oauth/authorize", issuer.replace(/\/$/, ""));
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes.join(" "));

  if (returnTo) {
    const state = Buffer.from(JSON.stringify({ returnTo })).toString(
      "base64url",
    );
    authUrl.searchParams.set("state", state);
  }

  return authUrl.toString();
}

export function getLogoutUrl(options: LogoutUrlOptions = {}): string {
  const { logoutEndpoint = "/api/auth/logout", returnTo } = options;

  if (returnTo) {
    return `${logoutEndpoint}?returnTo=${encodeURIComponent(returnTo)}`;
  }

  return logoutEndpoint;
}

export function createAuthConfig(config: AuthConfigOptions): AuthConfig {
  const {
    issuer,
    clientId,
    redirectUri,
    scopes = ["openid", "profile", "email", "users"],
  } = config;

  return {
    getLoginUrl: (returnTo?: string) =>
      getLoginUrl({ issuer, clientId, redirectUri, scopes, returnTo }),
    getLogoutUrl: (returnTo?: string) => getLogoutUrl({ returnTo }),
    issuer,
    clientId,
    redirectUri,
    scopes,
  };
}
