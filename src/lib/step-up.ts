import { createHash } from "crypto";
import { cookies } from "next/headers";
import { verifyTokenWithJWKS } from "./jwks.js";

export interface StepUpHelpersOptions {
  issuer: string;
  clientId: string;
  accessCookieName?: string;
}

export interface StepUpOptions {
  action: string;
  context?: unknown;
  userId?: string;
}

export interface StepUpChallenge {
  challengeToken: string;
  expiresIn: number;
}

export interface StepUpProof {
  proofToken: string;
  expiresIn: number;
}

export interface StepUpProofPayload {
  sub: string;
  client_id: string;
  action: string;
  context_hash: string;
  challenge_jti: string;
  amr: string[];
  auth_time: number;
}

export interface CreateChallengeOptions {
  action: string;
  context?: unknown;
}

export interface VerifyChallengeOptions {
  challengeToken: string;
  code: string;
}

export interface StepUpHelpers {
  createChallenge: (options: CreateChallengeOptions) => Promise<StepUpChallenge>;
  verifyChallenge: (options: VerifyChallengeOptions) => Promise<StepUpProof>;
  verifyProof: (proofToken: string, options: StepUpOptions) => Promise<StepUpProofPayload | null>;
  requireProof: (proofToken: string, options: StepUpOptions) => Promise<StepUpProofPayload>;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function hashContext(context?: unknown): string {
  return createHash("sha256")
    .update(stableStringify(context ?? null))
    .digest("base64url");
}

async function getAccessToken(accessCookieName: string): Promise<string> {
  const cookieStore = await cookies();
  const token = cookieStore.get(accessCookieName)?.value;

  if (!token) {
    throw new Error("Access token not found");
  }

  return token;
}

function assertProofPayload(payload: unknown): asserts payload is StepUpProofPayload {
  const value = payload as Partial<StepUpProofPayload>;

  if (
    typeof value.sub !== "string" ||
    typeof value.client_id !== "string" ||
    typeof value.action !== "string" ||
    typeof value.context_hash !== "string" ||
    typeof value.challenge_jti !== "string" ||
    !Array.isArray(value.amr) ||
    typeof value.auth_time !== "number"
  ) {
    throw new Error("Invalid step-up proof payload");
  }
}

export function createStepUpHelpers(options: StepUpHelpersOptions): StepUpHelpers {
  const { issuer, clientId, accessCookieName = "am25_at" } = options;

  if (!issuer) throw new Error("issuer is required");
  if (!clientId) throw new Error("clientId is required");

  const baseUrl = issuer.replace(/\/$/, "");

  const createChallenge = async ({ action, context }: CreateChallengeOptions): Promise<StepUpChallenge> => {
    const token = await getAccessToken(accessCookieName);
    const response = await fetch(`${baseUrl}/oauth/step-up/challenge`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, context }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Step-up challenge failed");
    }

    const data = (await response.json()) as { challenge_token: string; expires_in: number };
    return { challengeToken: data.challenge_token, expiresIn: data.expires_in };
  };

  const verifyChallenge = async ({ challengeToken, code }: VerifyChallengeOptions): Promise<StepUpProof> => {
    const token = await getAccessToken(accessCookieName);
    const response = await fetch(`${baseUrl}/oauth/step-up/verify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ challenge_token: challengeToken, code }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Step-up verification failed");
    }

    const data = (await response.json()) as { proof_token: string; expires_in: number };
    return { proofToken: data.proof_token, expiresIn: data.expires_in };
  };

  const requireProof = async (proofToken: string, proofOptions: StepUpOptions): Promise<StepUpProofPayload> => {
    const payload = await verifyTokenWithJWKS(proofToken, issuer, "step-up-proof+jwt", {
      audience: clientId,
    });

    assertProofPayload(payload);

    if (
      payload.client_id !== clientId ||
      payload.action !== proofOptions.action ||
      payload.context_hash !== hashContext(proofOptions.context) ||
      !payload.amr.includes("otp")
    ) {
      throw new Error("Invalid step-up proof");
    }

    if (proofOptions.userId && payload.sub !== proofOptions.userId) {
      throw new Error("Invalid step-up proof user");
    }

    return payload;
  };

  const verifyProof = async (proofToken: string, proofOptions: StepUpOptions): Promise<StepUpProofPayload | null> => {
    try {
      return await requireProof(proofToken, proofOptions);
    } catch {
      return null;
    }
  };

  return {
    createChallenge,
    verifyChallenge,
    verifyProof,
    requireProof,
  };
}
