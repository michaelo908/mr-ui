"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  GRAVITAS_RESUME_MARKER_KEY,
  isValidResumeTarget,
} from "@/lib/gravitas-workspace";

function getValidatedNextTarget() {
  const queryTarget = new URLSearchParams(window.location.search).get("next");
  if (isValidResumeTarget(queryTarget)) return queryTarget;
  const storedTarget = window.localStorage.getItem(GRAVITAS_RESUME_MARKER_KEY);
  return isValidResumeTarget(storedTarget) ? storedTarget : "/workbench";
}

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [token, setToken] = useState("");
  const otpEnabled = process.env.NEXT_PUBLIC_SUPABASE_URL ===
    "https://gglalhqmdnbdygcxasyd.supabase.co";

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (sending || !otpEnabled) return;
    if (!/^\d{6}$/.test(token)) {
      setMessage("Enter the six-digit code from your email.");
      return;
    }
    setSending(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(), token, type: "email",
      });
      if (error) {
        setMessage("That code could not be verified. Check the code or request a new one.");
      } else {
        window.location.href = getValidatedNextTarget();
      }
    } catch {
      setMessage("We could not verify the code. Please try again.");
    } finally {
      setSending(false);
    }
  }

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
          window.location.href = getValidatedNextTarget();
          return true;
        }
      }

      return false;
    }

    async function checkSession() {
      if (new URLSearchParams(window.location.search).get("error") === "auth_callback") {
        setMessage("This login link could not be completed. Request a new link and open it in the same browser.");
      }

      const handledHash = await hydrateFromHash();
      if (handledHash) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (mounted && session) {
        window.location.href = getValidatedNextTarget();
      }
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        window.location.href = getValidatedNextTarget();
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

    const loginResponse = await fetch("/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, next: getValidatedNextTarget() }),
    });
    const result = await loginResponse.json().catch(() => null);

    if (!loginResponse.ok) {
      setMessage(
        typeof result?.error === "string"
          ? result.error
          : "We could not send a login link. Please try again."
      );
    } else {
      setCodeSent(otpEnabled);
      setMessage(otpEnabled ? "Check your email for the six-digit sign-in code." : "Check your email for the login link.");
    }

    setSending(false);
  }

  return (
    <main className="gravitas-shell flex min-h-screen items-center justify-center px-4 py-10 text-neutral-100">
      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-9 flex justify-center">
          <div
            role="img"
            aria-label="Gravitas Narrative Intelligence"
            className="gravitas-blue-logo gravitas-login-logo"
          />
        </div>

        <form
          onSubmit={codeSent ? handleVerify : handleLogin}
          className="gravitas-header flex w-full flex-col gap-4 rounded-2xl p-6 sm:p-7"
        >
          <div className="text-center">
            <h1 className="text-xl font-semibold">Sign in to Gravitas</h1>

            <p className="mt-2 text-sm text-neutral-400">
              Narrative analysis and rewrite engine
            </p>

            <p className="mt-2 text-sm text-neutral-400">
              See how your message will land before you send it.
            </p>

            <p className="mt-2 text-sm text-neutral-500">
              Enter the email address linked to your Gravitas access.
            </p>
          </div>

          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={sending || codeSent}
            className="rounded-xl border border-neutral-700 bg-black/30 p-3 text-neutral-100 shadow-inner outline-none transition focus:border-sky-500/70 disabled:cursor-not-allowed disabled:opacity-60"
            required
          />

          {codeSent && (
            <input
              type="text"
              aria-label="Six-digit sign-in code"
              placeholder="Six-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
              disabled={sending}
              className="rounded-xl border border-neutral-700 bg-black/30 p-3 text-neutral-100"
              required
            />
          )}

          <button
            type="submit"
            disabled={sending}
            className={`rounded-xl border border-sky-300/30 p-3 font-semibold text-[#07111d] shadow-[0_10px_30px_rgba(46,139,236,0.18)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70 ${
              sending ? "animate-pulse bg-sky-200" : "bg-[#58a6ff]"
            }`}
          >
            {sending ? (codeSent ? "Verifying..." : "Sending...") : (codeSent ? "Verify code" : otpEnabled ? "Send sign-in code" : "Send login link")}
          </button>

          {codeSent && (
            <button type="button" disabled={sending} onClick={() => {
              setCodeSent(false);
              setToken("");
              setMessage("");
            }}>Request another code or use a different email</button>
          )}

          {message && <p className="text-sm text-neutral-400">{message}</p>}
        </form>
      </div>
    </main>
  );
}
