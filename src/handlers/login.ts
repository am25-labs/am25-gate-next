import { type NextRequest, type NextResponse } from "next/server";
import {
  createAuthorizationResponse,
  type AuthorizationRequestOptions,
} from "../lib/oauth-transaction.js";

export interface LoginHandlerOptions extends AuthorizationRequestOptions {}

export function createLoginHandler(options: LoginHandlerOptions) {
  return async function handleLogin(request: NextRequest): Promise<NextResponse> {
    return createAuthorizationResponse(
      options,
      request.nextUrl.searchParams.get("returnTo"),
    );
  };
}

export { createLoginHandler as handleLogin };
