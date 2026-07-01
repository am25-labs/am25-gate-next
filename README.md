# @am25/gate-next

Server-side SDK for integrating Next.js 16+ applications with **AM25 Gate IdP**, an Identity Provider compatible with OAuth 2.0 and OpenID Connect.

## Features

- **TypeScript-first**: Full type definitions with exported interfaces
- Server-first authentication: no React providers, no forced CSR
- OAuth 2.0 + OIDC: Authorization Code flow with full scope support
- Proxy for Next.js 16: Server-level route protection
- httpOnly Cookie: Secure session shared across subdomains
- React Helpers: Cached functions for Server Components
- RS256 (JWKS): Token verification using public keys, no shared secrets
- Roles and permissions: Access user roles via the `roles` scope

## Installation

```bash
# pnpm
pnpm add @am25/gate-next

# npm
npm install @am25/gate-next

# yarn
yarn add @am25/gate-next
```

## Requirements

- Next.js 16+
- React 19+
- An app registered as an OAuth client in Gate

## Configuration

### 1. Environment variables

Create `.env.local`:

```env
# Gate OAuth
GATE_ISSUER=https://gate.example.com
GATE_CLIENT_ID=your-client-id
GATE_CLIENT_SECRET=your-client-secret
GATE_REDIRECT_URI=https://myapp.example.com/api/auth/callback

# Cookie
COOKIE_DOMAIN=.example.com

# For client-side components (LoginButton)
NEXT_PUBLIC_GATE_ISSUER=https://gate.example.com
NEXT_PUBLIC_GATE_CLIENT_ID=your-client-id
NEXT_PUBLIC_GATE_REDIRECT_URI=https://myapp.example.com/api/auth/callback
```

You do not need `JWT_SECRET`. Tokens are verified using Gate's public key (JWKS).

### 2. Create API Routes

#### `/api/auth/callback/route.ts`

Exchanges the authorization code for tokens and sets the session cookie.

```ts
import { createCallbackHandler } from "@am25/gate-next";
import type { NextRequest } from "next/server";

const handler = createCallbackHandler({
  issuer: process.env.GATE_ISSUER!,
  clientId: process.env.GATE_CLIENT_ID!,
  clientSecret: process.env.GATE_CLIENT_SECRET!,
  redirectUri: process.env.GATE_REDIRECT_URI!,
  cookieDomain: process.env.COOKIE_DOMAIN,
  defaultRedirect: "/dashboard",
});

export async function GET(request: NextRequest) {
  return handler(request);
}
```

<details>
<summary>JavaScript version</summary>

```js
import { createCallbackHandler } from "@am25/gate-next";

const handler = createCallbackHandler({
  issuer: process.env.GATE_ISSUER,
  clientId: process.env.GATE_CLIENT_ID,
  clientSecret: process.env.GATE_CLIENT_SECRET,
  redirectUri: process.env.GATE_REDIRECT_URI,
  cookieDomain: process.env.COOKIE_DOMAIN,
  defaultRedirect: "/dashboard",
});

export async function GET(request) {
  return handler(request);
}
```

</details>

#### `/api/auth/logout/route.ts`

Clears the local cookie and optionally logs out from Gate (federated logout).

```ts
import { createLogoutHandler } from "@am25/gate-next";
import type { NextRequest } from "next/server";

const handler = createLogoutHandler({
  issuer: process.env.GATE_ISSUER,
  redirectUri: process.env.GATE_REDIRECT_URI!,
  cookieDomain: process.env.COOKIE_DOMAIN,
  redirectTo: "/",
});

export async function GET(request: NextRequest) {
  return handler(request);
}
```

<details>
<summary>JavaScript version</summary>

```js
import { createLogoutHandler } from "@am25/gate-next";

const handler = createLogoutHandler({
  issuer: process.env.GATE_ISSUER,
  redirectUri: process.env.GATE_REDIRECT_URI,
  cookieDomain: process.env.COOKIE_DOMAIN,
  redirectTo: "/",
});

export async function GET(request) {
  return handler(request);
}
```

</details>

### 3. Configure Proxy (Next.js 16)

The proxy protects routes by verifying the session cookie. If there is no valid session, the user is redirected to Gate to authenticate.

Create `src/proxy.ts`:

```ts
import { createGateProxy } from "@am25/gate-next";
import type { NextRequest } from "next/server";

const gateProxy = createGateProxy({
  issuer: process.env.GATE_ISSUER!,
  clientId: process.env.GATE_CLIENT_ID!,
  redirectUri: process.env.GATE_REDIRECT_URI!,
  protectedPaths: ["/dashboard", "/settings"],
  publicPaths: ["/dashboard/public"],
});

export async function proxy(request: NextRequest) {
  return gateProxy(request);
}

export const config = {
  matcher: ["/dashboard/:path*", "/settings/:path*"],
};
```

<details>
<summary>JavaScript version</summary>

```js
import { createGateProxy } from "@am25/gate-next";

const gateProxy = createGateProxy({
  issuer: process.env.GATE_ISSUER,
  clientId: process.env.GATE_CLIENT_ID,
  redirectUri: process.env.GATE_REDIRECT_URI,
  protectedPaths: ["/dashboard", "/settings"],
  publicPaths: ["/dashboard/public"],
});

export async function proxy(request) {
  return gateProxy(request);
}

export const config = {
  matcher: ["/dashboard/:path*", "/settings/:path*"],
};
```

</details>

### 4. Create session helpers

Create `src/lib/auth.ts`:

```ts
import { createSessionHelpers } from "@am25/gate-next";

export const {
  getSession,
  getUser,
  isAuthenticated,
  requireAuth,
  requireAdmin,
  hasRole,
  requireRole,
} = createSessionHelpers({
  issuer: process.env.GATE_ISSUER!,
});
```

<details>
<summary>JavaScript version</summary>

```js
import { createSessionHelpers } from "@am25/gate-next";

export const {
  getSession,
  getUser,
  isAuthenticated,
  requireAuth,
  requireAdmin,
  hasRole,
  requireRole,
} = createSessionHelpers({
  issuer: process.env.GATE_ISSUER,
});
```

</details>

## Usage

### In Server Components

```tsx
import { requireAuth } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await requireAuth();

  return (
    <div>
      <h1>Hello, {user.name}</h1>
      <p>Email: {user.email}</p>
      {user.isAdmin && <span>You are an administrator</span>}
    </div>
  );
}
```


### Syncing Gate roles into local RBAC

Gate can expose the global role catalog to client apps through `/oauth/roles`. The SDK stores an `am25_at` httpOnly access token during the OAuth callback and uses it from server-side helpers.

```ts
import { createRoleHelpers } from "@am25/gate-next";
import prisma from "@/lib/prisma";

const roles = createRoleHelpers({
  issuer: process.env.GATE_ISSUER!,
});

export async function syncGateRoles() {
  return roles.syncRoles(async (gateRoles) => {
    await Promise.all(
      gateRoles.map((role) =>
        prisma.role.upsert({
          where: { gateKey: role.key },
          update: { name: role.name, gateId: role.id },
          create: { gateId: role.id, gateKey: role.key, name: role.name },
        }),
      ),
    );
  });
}
```

Each app owns its permissions schema. The SDK only fetches Gate roles and hands them to your app so it can upsert local RBAC rows without overwriting permission flags.

### Checking roles

Roles are available by default (the `roles` scope is included). If for some reason you need to exclude them, configure `scopes` without `"roles"` in the proxy or in `getLoginUrl`.

```tsx
import { requireRole, hasRole } from "@/lib/auth";

export default async function EditorPage() {
  await requireRole("editor");

  const canPublish = await hasRole("publisher");

  return <div>...</div>;
}
```

### In Server Actions

```ts
"use server";

import { getUser } from "@/lib/auth";

interface CreatePostData {
  title: string;
  content: string;
}

export async function createPost(data: CreatePostData) {
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  await prisma.post.create({
    data: {
      ...data,
      authorId: user.id,
    },
  });
}
```

<details>
<summary>JavaScript version</summary>

```js
"use server";

import { getUser } from "@/lib/auth";

export async function createPost(data) {
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  await prisma.post.create({
    data: {
      ...data,
      authorId: user.id,
    },
  });
}
```

</details>

### Login button (Client Component)

```tsx
"use client";

import { getLoginUrl } from "@am25/gate-next";

export function LoginButton() {
  const handleLogin = () => {
    const url = getLoginUrl({
      issuer: process.env.NEXT_PUBLIC_GATE_ISSUER!,
      clientId: process.env.NEXT_PUBLIC_GATE_CLIENT_ID!,
      redirectUri: process.env.NEXT_PUBLIC_GATE_REDIRECT_URI!,
      returnTo: "/dashboard",
    });
    window.location.href = url;
  };

  return <button onClick={handleLogin}>Log in</button>;
}
```

<details>
<summary>JavaScript version</summary>

```jsx
"use client";

import { getLoginUrl } from "@am25/gate-next";

export function LoginButton() {
  const handleLogin = () => {
    const url = getLoginUrl({
      issuer: process.env.NEXT_PUBLIC_GATE_ISSUER,
      clientId: process.env.NEXT_PUBLIC_GATE_CLIENT_ID,
      redirectUri: process.env.NEXT_PUBLIC_GATE_REDIRECT_URI,
      returnTo: "/dashboard",
    });
    window.location.href = url;
  };

  return <button onClick={handleLogin}>Log in</button>;
}
```

</details>

### Logout link

```jsx
export function LogoutButton() {
  return <a href="/api/auth/logout">Log out</a>;
}
```

## Scopes

Gate supports the following OIDC scopes:

| Scope     | Claims included in the token          |
| --------- | ------------------------------------- |
| `openid`  | `sub` (required for OIDC)             |
| `profile` | `name`, `lastName`                    |
| `email`   | `email`                               |
| `roles`   | `{issuer}/is_admin`, `{issuer}/roles` |

The default scope is `openid profile email roles`.

Role claims use a namespace URI for compatibility with the OIDC standard. The SDK resolves them automatically in `getUser()`.

## User data

The object returned by `getUser()` implements the `GateUser` interface:

```ts
interface GateUser {
  id: string;        // JWT sub
  email: string;     // requires "email" scope
  name: string;      // requires "profile" scope
  lastName: string;  // requires "profile" scope
  isAdmin: boolean;  // requires "roles" scope (default: false)
  roles: string[];   // requires "roles" scope (default: [])
}
```

### Difference between getSession and getUser

| Function       | Returns              | User ID       | Recommended use   |
| -------------- | -------------------- | ------------- | ----------------- |
| `getSession()` | `JWTPayload \| null` | `session.sub` | Access raw claims |
| `getUser()`    | `GateUser \| null`   | `user.id`     | Business logic    |

Use `getUser()` for business logic. Use `getSession()` only if you need direct access to JWT claims.

## API Reference

### `createGateProxy(options)`

Creates a proxy to protect routes in Next.js 16.

| Option           | Type     | Required | Default                                   | Description                         |
| ---------------- | -------- | -------- | ----------------------------------------- | ----------------------------------- |
| `issuer`         | string   | Yes      |                                           | Gate server URL                     |
| `clientId`       | string   | Yes      |                                           | App Client ID                       |
| `redirectUri`    | string   | Yes      |                                           | Callback URI                        |
| `protectedPaths` | string[] | No       | `["/dashboard"]`                          | Routes to protect                   |
| `publicPaths`    | string[] | No       | `[]`                                      | Public routes inside protectedPaths |
| `cookieName`     | string   | No       | `"am25_sess"`                             | Cookie name                         |
| `scopes`         | string[] | No       | `["openid", "profile", "email", "roles"]` | Scopes requested during redirect    |

Returns `null` if the route does not require protection or the session is valid. Returns `NextResponse.redirect` if authentication is required.

### `createCallbackHandler(options)`

Creates the handler to exchange the authorization code for tokens.

| Option            | Type   | Required | Default         | Description                           |
| ----------------- | ------ | -------- | --------------- | ------------------------------------- |
| `issuer`          | string | Yes      |                 | Gate server URL                       |
| `clientId`        | string | Yes      |                 | Client ID                             |
| `clientSecret`    | string | Yes      |                 | Client Secret                         |
| `redirectUri`     | string | Yes      |                 | Callback URI (must match Gate config) |
| `cookieName`      | string | No       | `"am25_sess"`   | Session cookie name                   |
| `accessCookieName` | string | No       | `"am25_at"`     | Access token cookie name              |
| `cookieDomain`    | string | No       |                 | Cookie domain (e.g. `.example.com`)   |
| `cookieMaxAge`    | number | No       | `2592000` (30d) | Duration in seconds                   |
| `defaultRedirect` | string | No       | `"/dashboard"`  | Route after login                     |

The handler stores the `session_token` (or `access_token` as fallback) in an httpOnly session cookie. It also stores `access_token` in a separate httpOnly cookie with a maximum age of 1 hour for server-side SDK helpers.

### `createLogoutHandler(options)`

Creates the logout handler.

| Option         | Type   | Required | Default       | Description                                 |
| -------------- | ------ | -------- | ------------- | ------------------------------------------- |
| `redirectUri`  | string | Yes      |               | Callback URI (used to determine app origin) |
| `issuer`       | string | No       |               | Gate URL (enables federated logout)         |
| `cookieName`   | string | No       | `"am25_sess"` | Cookie name                                 |
| `cookieDomain` | string | No       |               | Cookie domain                               |
| `redirectTo`   | string | No       | `"/"`         | Route after logout                          |

**Federated logout:** If `issuer` is provided, logout redirects to Gate to close the user's global session across all apps. Otherwise, it only clears the local cookie.

### `createSessionHelpers(options)`

Creates helpers to access the session in Server Components.

| Option       | Type   | Required | Default       | Description     |
| ------------ | ------ | -------- | ------------- | --------------- |
| `issuer`     | string | Yes      |               | Gate server URL |
| `cookieName` | string | No       | `"am25_sess"` | Cookie name     |

Returns a `SessionHelpers` object:

| Helper                 | Returns                | Description                              |
| ---------------------- | ---------------------- | ---------------------------------------- |
| `getSession()`         | `JWTPayload \| null`   | Raw JWT payload                          |
| `getUser()`            | `GateUser \| null`     | Formatted user data                      |
| `isAuthenticated()`    | `boolean`              | Whether a session exists                 |
| `requireAuth()`        | `GateUser`             | User data, throws if not authenticated   |
| `requireAdmin()`       | `GateUser`             | User data, throws if not admin           |
| `hasRole(roleKey)`     | `boolean`              | Checks if the user has a role            |
| `requireRole(roleKey)` | `GateUser`             | User data, throws if the role is missing |

All functions are cached per request using `React.cache()`.

### `getLoginUrl(options)`

Generates the URL to start the OAuth flow.

| Option        | Type     | Required | Default                                   | Description                    |
| ------------- | -------- | -------- | ----------------------------------------- | ------------------------------ |
| `issuer`      | string   | Yes      |                                           | Gate server URL                |
| `clientId`    | string   | Yes      |                                           | Client ID                      |
| `redirectUri` | string   | Yes      |                                           | Callback URI                   |
| `scopes`      | string[] | No       | `["openid", "profile", "email", "roles"]` | Scopes to request              |
| `returnTo`    | string   | No       |                                           | Route to return to after login |

### `getLogoutUrl(options)`

Generates the URL for the local logout endpoint.

| Option           | Type   | Required | Default              | Description          |
| ---------------- | ------ | -------- | -------------------- | -------------------- |
| `logoutEndpoint` | string | No       | `"/api/auth/logout"` | Logout handler route |
| `returnTo`       | string | No       |                      | URL after logout     |

### `createAuthConfig(config)`

Creates a reusable configuration that encapsulates `getLoginUrl` and `getLogoutUrl`.

```ts
import { createAuthConfig } from "@am25/gate-next";

const auth = createAuthConfig({
  issuer: process.env.NEXT_PUBLIC_GATE_ISSUER!,
  clientId: process.env.NEXT_PUBLIC_GATE_CLIENT_ID!,
  redirectUri: process.env.NEXT_PUBLIC_GATE_REDIRECT_URI!,
  scopes: ["openid", "profile", "email", "roles"],
});

const loginUrl = auth.getLoginUrl("/dashboard");
const logoutUrl = auth.getLogoutUrl("/");
```

### `createRoleHelpers(options)`

Creates server-side helpers to fetch Gate's global role catalog and sync it into the app's local RBAC tables.

| Option             | Type   | Required | Default     | Description              |
| ------------------ | ------ | -------- | ----------- | ------------------------ |
| `issuer`           | string | Yes      |             | Gate server URL          |
| `accessCookieName` | string | No       | `"am25_at"` | Access token cookie name |

| Helper        | Returns                 | Description                         |
| ------------- | ----------------------- | ----------------------------------- |
| `getRoles()`  | `Promise<GateRole[]>`   | Fetches roles from `/oauth/roles`   |
| `syncRoles()` | `Promise<GateRole[]>`   | Fetches roles and calls your upsert |

### `verifyTokenWithJWKS(token, issuer, expectedTyp)`

Verifies a JWT using Gate’s public key (JWKS). Used internally by the SDK but available for manual verification.

| Parameter     | Type   | Required | Description                                        |
| ------------- | ------ | -------- | -------------------------------------------------- |
| `token`       | string | Yes      | JWT to verify                                      |
| `issuer`      | string | Yes      | Gate server URL                                    |
| `expectedTyp` | string | No       | Expected header type (e.g. `"st+jwt"`, `"at+jwt"`) |

### `clearJWKSCache(issuer)`

Clears the JWKS public key cache. Useful if Gate rotates its keys.

| Parameter | Type   | Required | Description                              |
| --------- | ------ | -------- | ---------------------------------------- |
| `issuer`  | string | No       | Issuer URL. If omitted, clears all cache |

## Exported types

All option interfaces and return types are exported for use in your own code:

```ts
import type {
  GateUser,
  SessionHelpers,
  SessionHelpersOptions,
  GateProxyOptions,
  CallbackHandlerOptions,
  LogoutHandlerOptions,
  LoginUrlOptions,
  LogoutUrlOptions,
  AuthConfig,
  AuthConfigOptions,
} from "@am25/gate-next";
```

## Authentication flow

```
User            App (proxy)            Gate (IdP)           App (callback)
  |                  |                      |                      |
  | GET /dashboard   |                      |                      |
  | ---------------> |                      |                      |
  |                  |                      |                      |
  |                  | No valid cookie      |                      |
  |                  | Redirect to Gate     |                      |
  | <--------------- |                      |                      |
  |                  |                      |                      |
  | Login on Gate                           |                      |
  | --------------------------------------->|                      |
  |                  |                      |                      |
  | Redirect with authorization code       |                      |
  | <---------------------------------------|                      |
  |                  |                      |                      |
  | GET /api/auth/callback?code=xxx                               |
  | -------------------------------------------------------------->|
  |                  |                      |                      |
  |                  |                      | POST /oauth/token    |
  |                  |                      |<---------------------|
  |                  |                      |                      |
  |                  |                      | Returns tokens       |
  |                  |                      |--------------------->|
  |                  |                      |                      |
  | Set-Cookie: am25_sess (httpOnly, RS256)                       |
  | <--------------------------------------------------------------|
  |                  |                      |                      |
  | Redirect to /dashboard                                         |
  | ---------------> |                      |                      |
  |                  |                      |                      |
  |                  | Verify token (JWKS) |                      |
  |                  | -------------------> |                      |
  |                  |                      |                      |
  |                  | Public key (cache)  |                      |
  |                  | <------------------- |                      |
  |                  |                      |                      |
  | Page OK          |                      |                      |
  | <--------------- |                      |                      |
```

## Token verification (RS256)

The SDK verifies tokens using Gate’s public key obtained from the JWKS endpoint:

```
GET {issuer}/.well-known/jwks.json
```

- Only Gate has the private key (used to sign tokens)
- Apps only need the public key (used to verify tokens)
- The public key is automatically cached in memory

## Domain cookies

Apps share sessions by domain:

- Apps on `*.example.com` → cookie on `.example.com`
- Apps on `*.example.com` → cookie on `.example.com`

Each domain has its own session. They do not cross.

## Access control

Gate manages access at two levels:

**Per application:** In the Gate dashboard you configure which users can access each app. Administrators automatically have access to all apps. If an unauthorized user tries to authenticate, Gate returns a 403 error.

**Per role (inside the app):** Roles travel as claims in the token when the `roles` scope is requested. Each app decides how to use them internally (e.g. show/hide features, protect routes).

## Internal vs third-party clients

Gate distinguishes two types of OAuth clients:

| Type                       | Consent             | Use case                            |
| -------------------------- | ------------------- | ----------------------------------- |
| **Internal (first-party)** | No, auto-approved   | Apps within the AM25 ecosystem      |
| **Third-party**            | Yes, consent screen | External apps integrating with Gate |

Configured in the Gate dashboard when creating or editing a client.

## Compatibility with standard libraries

Gate is an OAuth 2.0 and OpenID Connect compatible Identity Provider. Besides this SDK, you can integrate it with any library that supports OIDC Discovery:

```
Discovery: {issuer}/.well-known/openid-configuration
JWKS:      {issuer}/.well-known/jwks.json
```
