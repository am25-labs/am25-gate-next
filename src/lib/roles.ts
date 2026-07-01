import { cookies } from "next/headers";

export interface RoleHelpersOptions {
  issuer: string;
  accessCookieName?: string;
}

export interface GateRole {
  id: string;
  key: string;
  name: string;
}

export type RoleUpsert = (roles: GateRole[]) => Promise<void>;

export interface RoleHelpers {
  getRoles: () => Promise<GateRole[]>;
  syncRoles: (upsert: RoleUpsert) => Promise<GateRole[]>;
}

export function createRoleHelpers(options: RoleHelpersOptions): RoleHelpers {
  const { issuer, accessCookieName = "am25_at" } = options;

  if (!issuer) throw new Error("issuer is required");

  const getRoles = async (): Promise<GateRole[]> => {
    const cookieStore = await cookies();
    const token = cookieStore.get(accessCookieName)?.value;

    if (!token) return [];

    const response = await fetch(`${issuer.replace(/\/$/, "")}/oauth/roles`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!response.ok) return [];

    const data = (await response.json()) as { roles?: GateRole[] };
    return data.roles ?? [];
  };

  const syncRoles = async (upsert: RoleUpsert): Promise<GateRole[]> => {
    const roles = await getRoles();
    await upsert(roles);
    return roles;
  };

  return {
    getRoles,
    syncRoles,
  };
}
