"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        window.location.href = "/";
      }
    }

    checkSession();
  }, [supabase]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

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
            <h1 className="text-xl font-semibold">Sign in to Gravitas</h1>
            <p className="mt-2 text-sm text-neutral-400">
              Enter your email to continue.
            </p>
          </div>

          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-neutral-700 bg-neutral-900 p-3 text-neutral-100 outline-none focus:border-neutral-500"
            required
          />

          <button
            type="submit"
            className="rounded bg-white p-3 font-semibold text-black transition hover:bg-neutral-200"
          >
            Send login link
          </button>

          {message && <p className="text-sm text-neutral-400">{message}</p>}
        </form>
      </div>
    </main>
  );
}