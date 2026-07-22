export { createGateProxy, gateProxy } from "./proxy.js";
export type { GateProxyOptions } from "./proxy.js";

export { createCallbackHandler, handleCallback } from "./handlers/callback.js";
export type { CallbackHandlerOptions } from "./handlers/callback.js";

export { createLogoutHandler, handleLogout } from "./handlers/logout.js";
export type { LogoutHandlerOptions } from "./handlers/logout.js";

export { createSessionHelpers } from "./lib/session.js";
export type { SessionHelpersOptions, GateUser, SessionHelpers } from "./lib/session.js";

export { getLoginUrl, getLogoutUrl, createAuthConfig } from "./lib/auth.js";
export type { LoginUrlOptions, LogoutUrlOptions, AuthConfigOptions, AuthConfig } from "./lib/auth.js";

export { verifyTokenWithJWKS, clearJWKSCache } from "./lib/jwks.js";

export { createRoleHelpers } from "./lib/roles.js";
export type { RoleHelpersOptions, GateRole, RoleUpsert, RoleHelpers } from "./lib/roles.js";

export { createStepUpHelpers } from "./lib/step-up.js";
export type { StepUpHelpersOptions, StepUpOptions, StepUpChallenge, StepUpProof, StepUpProofPayload, VerifyOtpOptions, StepUpHelpers } from "./lib/step-up.js";
