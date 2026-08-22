"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function BillingPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/stripe/portal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ returnPath: "/" }),
        });
        const body = await response.json();
        if (!response.ok || typeof body.url !== "string") throw new Error("unavailable");
        window.location.assign(body.url);
      } catch {
        setError("Billing management is temporarily unavailable.");
      }
    })();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-neutral-100">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Manage billing</h1>
        <p className="mt-3 text-sm text-neutral-400">
          {error ?? "Opening Stripe’s secure billing portal…"}
        </p>
        {error ? <Link className="mt-6 inline-block text-blue-400 underline" href="/">Return to Gravitas</Link> : null}
      </div>
    </main>
  );
}

