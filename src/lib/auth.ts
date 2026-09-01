export interface LoginUrlOptions {
  loginEndpoint?: string;
  returnTo?: string;
}

export interface LogoutUrlOptions {
  logoutEndpoint?: string;
  returnTo?: string;
}

export interface AuthConfigOptions {
  loginEndpoint?: string;
  logoutEndpoint?: string;
}

export interface AuthConfig {
  getLoginUrl: (returnTo?: string) => string;
  getLogoutUrl: (returnTo?: string) => string;
}

export function getLoginUrl(options: LoginUrlOptions): string {
  const { loginEndpoint = "/api/auth/login", returnTo } = options;
  if (
    !loginEndpoint.startsWith("/") ||
    loginEndpoint.startsWith("//") ||
    loginEndpoint.includes("\\")
  ) {
    throw new Error("loginEndpoint must be a local path");
  }

  const url = new URL(loginEndpoint, "https://app.local");
  if (returnTo) url.searchParams.set("returnTo", returnTo);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function getLogoutUrl(options: LogoutUrlOptions = {}): string {
  const { logoutEndpoint = "/api/auth/logout", returnTo } = options;

  if (returnTo) {
    return `${logoutEndpoint}?returnTo=${encodeURIComponent(returnTo)}`;
  }

  return logoutEndpoint;
}

export function createAuthConfig(config: AuthConfigOptions): AuthConfig {
  const { loginEndpoint, logoutEndpoint } = config;

  return {
    getLoginUrl: (returnTo?: string) =>
      getLoginUrl({ loginEndpoint, returnTo }),
    getLogoutUrl: (returnTo?: string) =>
      getLogoutUrl({ logoutEndpoint, returnTo }),
  };
}
