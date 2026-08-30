import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function hasAuthenticatedJumpInUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return Boolean(user);
}
