import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isValidResumeTarget } from "@/lib/gravitas-workspace";

function redirectToLogin(origin: string, nextTarget: string) {
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("error", "auth_callback");
  if (nextTarget !== "/workbench") loginUrl.searchParams.set("next", nextTarget);
  return NextResponse.redirect(loginUrl);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const token_hash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const origin = requestUrl.origin;
  const requestedNext = requestUrl.searchParams.get("next");
  const nextTarget = isValidResumeTarget(requestedNext) ? requestedNext : "/workbench";

  const cookieStore = await cookies();
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
    return error ? redirectToLogin(origin, nextTarget) : response;
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
    return error ? redirectToLogin(origin, nextTarget) : response;
  }

  return redirectToLogin(origin, nextTarget);
}
