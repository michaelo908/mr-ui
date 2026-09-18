import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const EMAIL = /^\S+@\S+\.\S+$/;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const token = typeof body?.token === "string" ? body.token.trim() : "";

  if (!EMAIL.test(email) || !/^\d{6}$/.test(token)) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const response = NextResponse.json({ ok: true });
  let cookieWriteCount = 0;
  let resolveCookieWrite: (() => void) | null = null;
  const cookieWrite = new Promise<void>((resolve) => {
    resolveCookieWrite = resolve;
  });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookieWriteCount += cookiesToSet.length;
          cookiesToSet.forEach(({ name, value, options }) => {
            const cookieOptions = {
              ...options,
              path: "/",
              sameSite: "lax",
              secure: request.nextUrl.protocol === "https:",
            } as const;
            cookieStore.set(name, value, cookieOptions);
            response.cookies.set(name, value, cookieOptions);
          });
          resolveCookieWrite?.();
        },
      },
    }
  );

  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) {
    return NextResponse.json({ error: "verification_failed" }, { status: 401 });
  }

  // Supabase fires its storage callback immediately after verification, but
  // does not wait for it before resolving verifyOtp. Do not return the HTTP
  // response until that callback has added the session cookie.
  await Promise.race([
    cookieWrite,
    new Promise<void>((resolve) => setTimeout(resolve, 250)),
  ]);

  if (cookieWriteCount === 0) {
    console.info("auth_verify_code", { outcome: "session_cookie_missing" });
    return NextResponse.json({ error: "session_cookie_missing" }, { status: 500 });
  }

  console.info("auth_verify_code", { outcome: "authenticated", cookieWriteCount });
  return response;
}
