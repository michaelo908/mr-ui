import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Server Components can read a refreshed session but cannot write
            // its cookie. Middleware or a Route Handler persists it instead.
            try {
              cookieStore.set(name, value, options);
            } catch {
              // A page render must not fail merely because the refresh cookie
              // can only be written in a mutable response context.
            }
          });
        },
      },
    }
  );
}
