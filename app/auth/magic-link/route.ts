import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isValidResumeTarget } from "@/lib/gravitas-workspace";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const AUTH_RESUME_COOKIE = "multirrupt_auth_resume";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const nextTarget = isValidResumeTarget(body?.next) ? body.next : "/workbench";

  if (!EMAIL.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const cookieStore = await cookies();
  let pkceVerifierWritten = false;
  let response: NextResponse = NextResponse.json({ ok: true });
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
            const cookieOptions = {
              ...options,
              path: "/",
              sameSite: "lax",
              secure: request.nextUrl.protocol === "https:",
            } as const;
            if (name.endsWith("-code-verifier")) pkceVerifierWritten = true;
            cookieStore.set(name, value, cookieOptions);
            response.cookies.set(name, value, cookieOptions);
          });
        },
      },
    }
  );

  const callbackUrl = new URL("/auth/callback", request.nextUrl.origin);
  callbackUrl.searchParams.set("next", nextTarget);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callbackUrl.toString() },
  });

  if (error) {
    response = NextResponse.json(
      { error: "We could not send a login link. Please try again." },
      { status: 502 }
    );
  }

  if (!error) {
    response.cookies.set(AUTH_RESUME_COOKIE, nextTarget, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 10 * 60,
    });
  }

  console.info("auth_magic_link", {
    outcome: error ? "request_failed" : "sent",
    pkceVerifierWritten,
  });

  return response;
}
