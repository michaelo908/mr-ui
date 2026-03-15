"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function hydrateFromHash() {
      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : "";

      if (!hash) return false;

      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");

      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });

        if (!error) {
          window.history.replaceState({}, "", "/login");
          window.location.href = "/";
          return true;
        }
      }

      return false;
    }

    async function checkSession() {
      const handledHash = await hydrateFromHash();
      if (handledHash) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (mounted && session) {
        window.location.href = "/";
      }
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        window.location.href = "/";
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;

    setSending(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Check your email for the login link.");
    }

    setSending(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-neutral-100">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex justify-center">
          <div className="rounded-md bg-white/90 px-4 py-2">
            <img
              src="/MR_Logo1.png"
              alt="Multirrupt"
              style={{ width: "280px", height: "auto" }}
            />
          </div>
        </div>

        <form
          onSubmit={handleLogin}
          className="flex w-full flex-col gap-4 rounded-xl border border-neutral-800 bg-neutral-950/80 p-6"
        >
          <div className="text-center">
  <h1 className="text-xl font-semibold">Sign in to use Gravitas</h1>

  <p className="mt-2 text-sm text-neutral-400">
    See how your message will land before you send it.
  </p>

  <p className="mt-2 text-sm text-neutral-500">
    New here? Get a link and try it on your writing.
  </p>
</div>

          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={sending}
            className="rounded border border-neutral-700 bg-neutral-900 p-3 text-neutral-100 outline-none focus:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-60"
            required
          />

          <button
            type="submit"
            disabled={sending}
            className={`rounded p-3 font-semibold text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-70 ${
              sending ? "animate-pulse bg-neutral-200" : "bg-white"
            }`}
          >
            {sending ? "Sending..." : "Send login link"}
          </button>

          {message && <p className="text-sm text-neutral-400">{message}</p>}
        </form>
      </div>
    </main>
  );
}