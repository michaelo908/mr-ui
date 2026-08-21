"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
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
    <main className="doorway-shell min-h-screen text-neutral-100">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-7">
        <Link href="/" aria-label="Gravitas Narrative Intelligence home">
          <span className="gravitas-blue-logo block" aria-hidden="true" />
        </Link>
        <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-neutral-300 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58a6ff]">Login to Gravitas</Link>
      </nav>

      <section className="doorway-hero mx-auto grid max-w-7xl overflow-hidden sm:mx-7 lg:mx-auto lg:grid-cols-[minmax(0,1.18fr)_minmax(21rem,.82fr)]">
        <div className="doorway-visual">
          <Image
            src={funnel.heroImage}
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 58vw, 100vw"
            className="doorway-image"
            style={{
              "--doorway-object-position": funnel.heroPosition,
              "--doorway-mobile-object-position": funnel.heroMobilePosition,
            } as CSSProperties}
          />
          <div className="doorway-image-shade" aria-hidden="true" />
          <div className="doorway-statement">
            <h1 className="text-[clamp(2.15rem,4.1vw,3.35rem)] font-semibold leading-[1.04] tracking-[-0.035em] text-white">{funnel.headline}</h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-neutral-200 sm:text-lg sm:leading-8">{funnel.supportingLine}</p>
          </div>
        </div>

        <div className="doorway-action flex items-center p-5 sm:p-8 lg:p-9">
          <form onSubmit={submit} className="doorway-form w-full rounded-2xl p-5 sm:p-7">
            <h2 className="text-2xl font-semibold leading-tight tracking-[-0.02em] text-white">{funnel.formHeading}</h2>
            <p className="mt-3 text-sm leading-6 text-neutral-400">{funnel.formExplanation}</p>
            <label className="mt-6 block text-sm font-medium" htmlFor="first-name">First name</label>
            <input id="first-name" required autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-neutral-700 bg-[#080a0c] px-4 py-3 outline-none transition-colors focus:border-[#C6A75A]" />
            <label className="mt-4 block text-sm font-medium" htmlFor="email">Email</label>
            <input id="email" required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-neutral-700 bg-[#080a0c] px-4 py-3 outline-none transition-colors focus:border-[#C6A75A]" />
            <label className="mt-5 flex gap-3 text-xs leading-5 text-neutral-400">
              <input required type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 size-4 shrink-0 accent-[#C6A75A]" />
              <span>Send me this check and a short series of useful Gravitas follow-ups. I can unsubscribe at any time.</span>
            </label>
            {status === "error" ? <p role="alert" className="mt-4 text-sm text-red-300">{error}</p> : null}
            <button disabled={status === "working"} className="mt-6 min-h-12 w-full rounded-xl border border-[#C6A75A] bg-[#C6A75A] px-5 py-3 font-semibold text-black transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f0d37d] disabled:opacity-60">
              {status === "working" ? "Unlocking…" : funnel.cta}
            </button>
            <p className="mt-3 text-center text-xs leading-5 text-neutral-500">{funnel.footerLine}</p>
          </form>
        </div>
      </section>
    </main>
  );
}
