import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isValidResumeTarget } from "@/lib/gravitas-workspace";
import { AUTH_RESUME_COOKIE } from "@/lib/auth-resume";

function clearResumeCookie(response: NextResponse) {
  response.cookies.set(AUTH_RESUME_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

function redirectToLogin(origin: string, nextTarget: string) {
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("error", "auth_callback");
  if (nextTarget !== "/workbench") loginUrl.searchParams.set("next", nextTarget);
  return clearResumeCookie(NextResponse.redirect(loginUrl));
}

type CallbackOutcome =
  | "missing_callback_credential"
  | "exchange_failed_without_verifier"
  | "exchange_failed_with_verifier"
  | "verification_failed"
  | "authenticated";

function logCallbackOutcome(outcome: CallbackOutcome) {
  // Keep authentication diagnostics bounded: no codes, tokens, cookie values,
  // account identifiers, or provider error text are ever emitted.
  console.info("auth_callback", { outcome });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const token_hash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const origin = requestUrl.origin;
  const cookieStore = await cookies();
  const requestedNext = requestUrl.searchParams.get("next");
  const resumeTarget = cookieStore.get(AUTH_RESUME_COOKIE)?.value;
  const nextTarget = isValidResumeTarget(requestedNext)
    ? requestedNext
    : isValidResumeTarget(resumeTarget)
      ? resumeTarget
      : "/workbench";
  const hasPkceVerifier = cookieStore
    .getAll()
    .some(({ name }) => name.endsWith("-code-verifier"));
  const response = NextResponse.redirect(new URL(nextTarget, origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      logCallbackOutcome(
        hasPkceVerifier
          ? "exchange_failed_with_verifier"
          : "exchange_failed_without_verifier"
      );
      return redirectToLogin(origin, nextTarget);
    }
    logCallbackOutcome("authenticated");
    return clearResumeCookie(response);
  }

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as
        | "signup"
        | "invite"
        | "magiclink"
        | "recovery"
        | "email_change"
        | "email",
    });
    if (error) {
      logCallbackOutcome("verification_failed");
      return redirectToLogin(origin, nextTarget);
    }
    logCallbackOutcome("authenticated");
    return clearResumeCookie(response);
  }

  logCallbackOutcome("missing_callback_credential");
  return redirectToLogin(origin, nextTarget);
}
