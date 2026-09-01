import { type NextRequest, NextResponse } from "next/server";

export interface CallbackHandlerOptions {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  cookieName?: string;
  accessCookieName?: string;
  cookieDomain?: string;
  cookieMaxAge?: number;
  defaultRedirect?: string;
}

export function createCallbackHandler(options: CallbackHandlerOptions) {
  const {
    issuer,
    clientId,
    clientSecret,
    redirectUri,
    cookieName = "am25_sess",
    accessCookieName = "am25_at",
    cookieDomain,
    cookieMaxAge = 60 * 60 * 24 * 30,
    defaultRedirect = "/dashboard",
  } = options;

  if (!issuer) throw new Error("issuer is required");
  if (!clientId) throw new Error("clientId is required");
  if (!clientSecret) throw new Error("clientSecret is required");
  if (!redirectUri) throw new Error("redirectUri is required");

  const tokenEndpoint = `${issuer.replace(/\/$/, "")}/oauth/token`;
  const appOrigin = new URL(redirectUri).origin;

  return async function handleCallback(request: NextRequest): Promise<NextResponse> {
    const { searchParams } = request.nextUrl;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      const errorDescription = searchParams.get("error_description") || error;
      return NextResponse.redirect(
        `${appOrigin}/login?error=${encodeURIComponent(errorDescription)}`,
      );
    }

    if (!code) {
      return NextResponse.redirect(`${appOrigin}/login?error=missing_code`);
    }

    try {
      const tokenResponse = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json().catch(() => ({}));
        console.error("Token exchange failed:", errorData);
        return NextResponse.redirect(
          `${appOrigin}/login?error=token_exchange_failed`,
        );
      }

      const tokens = await tokenResponse.json();
      if (
        typeof tokens.session_token !== "string" ||
        typeof tokens.access_token !== "string"
      ) {
        return NextResponse.redirect(
          `${appOrigin}/login?error=invalid_token_response`,
        );
      }

      let redirectTo = defaultRedirect;
      if (state) {
        try {
          const stateData = JSON.parse(
            Buffer.from(state, "base64url").toString(),
          );
          if (stateData.returnTo) {
            redirectTo = stateData.returnTo;
          }
        } catch {
          // Invalid state, use default
        }
      }

      const response = NextResponse.redirect(`${appOrigin}${redirectTo}`);

      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        domain: cookieDomain,
        path: "/",
      };

      response.cookies.set(
        cookieName,
        tokens.session_token,
        {
          ...cookieOptions,
          maxAge: cookieMaxAge,
        },
      );

      response.cookies.set(accessCookieName, tokens.access_token, {
        ...cookieOptions,
        maxAge: Math.min(cookieMaxAge, 60 * 60),
      });

      return response;
    } catch (error) {
      console.error("Callback handler error:", error);
      return NextResponse.redirect(`${appOrigin}/login?error=callback_failed`);
    }
  };
}

export { createCallbackHandler as handleCallback };
