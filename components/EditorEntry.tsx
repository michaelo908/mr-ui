"use client";

import { useEffect, useState } from "react";
import GravitasApp from "@/components/GravitasApp";
import { createClient } from "@/lib/supabase/client";

export default function EditorEntry() {
  const [mode, setMode] = useState<"loading" | "jump-in" | "full" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function resolveEditor() {
      try {
        const { data: { user }, error } = await createClient().auth.getUser();
        // A visitor without a session can open the editor before signing in.
        if (error && error.name !== "AuthSessionMissingError") throw error;
        if (!user) {
          if (active) setMode("jump-in");
          return;
        }

        const response = await fetch("/api/access", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Access lookup failed");
        const access = await response.json();
        if (!["jump_in", "day_pass", "subscriber"].includes(access.state)) {
          throw new Error("Unknown access state");
        }
        if (active) setMode(access.state === "jump_in" ? "jump-in" : "full");
      } catch {
        if (active) setMode("error");
      }
    }

    void resolveEditor();
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);

  if (mode === "loading") return <main>Opening your editor…</main>;
  if (mode === "error") {
    return (
      <main>
        <p>We could not open your editor. Check your connection and try again.</p>
        <button onClick={() => { setMode("loading"); setAttempt(value => value + 1); }}>
          Try again
        </button>
      </main>
    );
  }
  return mode === "full"
    ? <GravitasApp />
    : <GravitasApp experience="jump-in" requireAuthBeforeAnalysis />;
}
