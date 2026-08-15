"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { AcquisitionFunnel } from "@/lib/acquisition-funnels";
import { emitSignal, initializeSignalIdentity, signalHeaders } from "@/lib/signals/client";

export default function AcquisitionLandingPage({ funnel }: { funnel: AcquisitionFunnel }) {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    emitSignal("acquisition.funnel_viewed", "acquisition", { funnel: funnel.slug });
  }, [funnel.slug]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("working");
    setError("");
    const identity = initializeSignalIdentity();
    try {
      const response = await fetch("/api/acquisition/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...signalHeaders("acquisition") },
        body: JSON.stringify({
          firstName,
          email,
          consent,
          funnel: funnel.slug,
          firstTouch: identity.firstTouch,
          lastTouch: identity.lastTouch,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Signup could not be completed.");
      const query = new URLSearchParams({ funnel: funnel.slug, first_name: firstName.trim() });
      window.location.assign(`/jump-in?${query.toString()}`);
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Signup could not be completed.");
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <Image
          src="/gravitas-logo-white.png"
          alt="Gravitas Narrative Intelligence"
          width={168}
          height={36}
          priority
        />
        <a href="/login" className="text-sm font-semibold text-neutral-300 hover:text-white">Login to Gravitas</a>
      </nav>

      <section className="mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-12 lg:grid-cols-[1.15fr_.85fr] lg:items-center lg:pt-20">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#C6A75A]">{funnel.eyebrow}</p>
          <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">{funnel.headline}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-300">{funnel.subhead}</p>
        </div>

        <form onSubmit={submit} className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6 shadow-2xl sm:p-8">
          <h2 className="text-2xl font-semibold">Run one free reader-side check</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-400">Enter your details and your personal 20-minute Jump-In will open immediately.</p>
          <label className="mt-6 block text-sm font-medium" htmlFor="first-name">First name</label>
          <input id="first-name" required autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 outline-none focus:border-[#C6A75A]" />
          <label className="mt-4 block text-sm font-medium" htmlFor="email">Email</label>
          <input id="email" required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 outline-none focus:border-[#C6A75A]" />
          <label className="mt-5 flex gap-3 text-xs leading-5 text-neutral-400">
            <input required type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1" />
            <span>Send me this check and a short series of useful Gravitas follow-ups. I can unsubscribe at any time.</span>
          </label>
          {status === "error" ? <p role="alert" className="mt-4 text-sm text-red-300">{error}</p> : null}
          <button disabled={status === "working"} className="mt-6 w-full rounded-xl border border-[#C6A75A] bg-[#C6A75A] px-5 py-3 font-semibold text-black transition hover:brightness-110 disabled:opacity-60">
            {status === "working" ? "Unlocking…" : funnel.cta}
          </button>
          <p className="mt-3 text-center text-xs text-neutral-600">No card required. Your timer starts with the first analysis.</p>
        </form>
      </section>

      <section className="border-y border-neutral-900 bg-neutral-950/50">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-2">
          <div><h2 className="text-3xl font-semibold tracking-tight">{funnel.problemTitle}</h2><p className="mt-5 leading-7 text-neutral-400">{funnel.problem}</p></div>
          <div><h2 className="text-3xl font-semibold tracking-tight">{funnel.missedTitle}</h2><p className="mt-5 leading-7 text-neutral-400">{funnel.missed}</p></div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-20 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#C6A75A]">What Gravitas sees</p>
        <div className="mt-8 grid gap-4 text-left sm:grid-cols-3">
          {funnel.sees.map((item) => <div key={item} className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 text-sm leading-6 text-neutral-300">{item}</div>)}
        </div>
        <a href="#first-name" className="mt-10 inline-flex rounded-xl bg-[#C6A75A] px-6 py-3 font-semibold text-black">{funnel.cta}</a>
      </section>
    </main>
  );
}
