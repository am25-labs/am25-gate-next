import { cookies } from "next/headers";
import { cache } from "react";
import { verifyTokenWithJWKS } from "./jwks.js";
import type { JWTPayload } from "jose";

export interface SessionHelpersOptions {
  issuer: string;
  clientId: string;
  cookieName?: string;
}

export interface GateUser {
  id: string;
  email: string;
  name: string;
  lastName: string;
  picture: string | null;
  isAdmin: boolean;
  organizationId: string | null;
  organizationType: "CUSTOMER" | "INTERNAL" | null;
  organizationRole: "OWNER" | "MEMBER" | null;
}

export interface SessionHelpers {
  getSession: () => Promise<JWTPayload | null>;
  getUser: () => Promise<GateUser | null>;
  isAuthenticated: () => Promise<boolean>;
  requireAuth: () => Promise<GateUser>;
  requireAdmin: () => Promise<GateUser>;
}

export function createSessionHelpers(options: SessionHelpersOptions): SessionHelpers {
  const { issuer, clientId, cookieName = "am25_sess" } = options;

  if (!issuer) throw new Error("issuer is required");
  if (!clientId) throw new Error("clientId is required");

  const normalizedIssuer = issuer.replace(/\/$/, "");

  const getSession = cache(async (): Promise<JWTPayload | null> => {
    try {
      const cookieStore = await cookies();
      const token = cookieStore.get(cookieName)?.value;

      if (!token) return null;

      const payload = await verifyTokenWithJWKS(token, normalizedIssuer, "st+jwt");
      const response = await fetch(
        `${normalizedIssuer}/api/auth/session?client_id=${encodeURIComponent(clientId)}`,
        {
          headers: { Cookie: `${cookieName}=${token}` },
          cache: "no-store",
        },
      );
      if (!response.ok) return null;

      const activeSession = (await response.json()) as { id?: unknown };
      if (activeSession.id !== payload.sub) return null;

      return payload;
    } catch {
      return null;
    }
  });

  const nsIsAdmin = `${normalizedIssuer}/is_admin`;
  const namespace = normalizedIssuer;
  const nsOrganizationId = `${namespace}/organization_id`;
  const nsOrganizationType = `${namespace}/organization_type`;
  const nsOrganizationRole = `${namespace}/organization_role`;

  const getUser = cache(async (): Promise<GateUser | null> => {
    const session = await getSession();
    if (!session) return null;

    return {
      id: session.sub as string,
      email: session.email as string,
      name: session.name as string,
      lastName: session.lastName as string,
      picture: (session.picture as string | undefined) ?? null,
      isAdmin: (session[nsIsAdmin] as boolean) ?? false,
      organizationId:
        typeof session[nsOrganizationId] === "string"
          ? session[nsOrganizationId]
          : null,
      organizationType:
        session[nsOrganizationType] === "CUSTOMER" ||
        session[nsOrganizationType] === "INTERNAL"
          ? session[nsOrganizationType]
          : null,
      organizationRole:
        session[nsOrganizationRole] === "OWNER" ||
        session[nsOrganizationRole] === "MEMBER"
          ? session[nsOrganizationRole]
          : null,
    };
  });

  const isAuthenticated = async (): Promise<boolean> => {
    const session = await getSession();
    return session !== null;
  };

  const requireAuth = async (): Promise<GateUser> => {
    const user = await getUser();
    if (!user) {
      throw new Error("Not authenticated");
    }
    return user;
  };

  const requireAdmin = async (): Promise<GateUser> => {
    const user = await requireAuth();
    if (!user.isAdmin) {
      throw new Error("Not authorized");
    }
    return user;
  };

  return {
    getSession,
    getUser,
    isAuthenticated,
    requireAuth,
    requireAdmin,
  };
}
