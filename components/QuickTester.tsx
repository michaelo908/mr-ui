"use client";

import { useEffect, useMemo, useState } from "react";

const MR_GOLD = "#C6A75A";
const MAX_WORDS = 500;
const MAX_RUNS = 5;
const STORAGE_KEY = "gravitasQuickTesterRunsV1";
const PROCESSING_MESSAGES = [
  "Reading from the reader’s side…",
  "Mapping attention and momentum…",
  "Checking where trust may shift…",
  "Looking for the first point of friction…",
  "Finding the strongest reader-side signal…",
];

type QuickReadResult = {
  risk: string;
  adjustment: string;
  fullAnalysis: string;
};

function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function getRunsUsed() {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

function setRunsUsed(n: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(n));
}

export default function QuickTester() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<QuickReadResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [runsUsed, setRunsUsedState] = useState(() => getRunsUsed());
  const [processingIndex, setProcessingIndex] = useState(0);

  useEffect(() => {
  if (!isLoading) {
    setProcessingIndex(0);
    return;
  }

  const interval = setInterval(() => {
    setProcessingIndex((current) =>
      (current + 1) % PROCESSING_MESSAGES.length
    );
  }, 1400);

  return () => clearInterval(interval);
}, [isLoading]);

  const wordCount = useMemo(() => countWords(input), [input]);
  const overLimit = wordCount > MAX_WORDS;
  const runsRemaining = Math.max(0, MAX_RUNS - runsUsed);

  async function runQuickRead() {
    setError("");
    setResult(null);

    if (!input.trim()) {
      setError("Paste a short piece of writing first.");
      return;
    }

    if (overLimit) {
      setError(`Please keep it under ${MAX_WORDS} words.`);
      return;
    }

 if (runsRemaining <= 0) {
  setError(
    "You have 0 free Quick Tester runs remaining. You’ve seen the quick read. The Gravitas Day Pass gives you 48 hours with the full system: deeper diagnosis, rewrite options, Gravitons, and image/page review."
  );
  return;
}

    setIsLoading(true);

    const quickReadPrompt = `
You are Gravitas Quick Read.

Analyse the pasted commercial writing from the reader's side.

Return exactly this structure:

## Quick Gravitas Read

### 1. Main reader-side risk
Write 60–80 words. Be specific to the pasted text. Identify the main way the reader may lose attention, trust, clarity, urgency, or momentum. Do not give generic copywriting advice.

### 2. Most useful adjustment
Write 60–80 words. Give one specific improvement based on the actual pasted text. Explain why it would change the reader's experience.

### 3. What the full Gravitas analysis would examine
Write 60–80 words. Explain that a full Gravitas analysis typically produces 7–10 diagnostic points because messages usually fail as a sequence, not as one sentence. Mention attention, trust, momentum, assumptions, and rewrite options.

Do not produce a full rewrite.
Do not mention being a preview except in section 3.
Do not exceed 260 words total.
`.trim();

    try {
      const res = await fetch("/api/quick-read", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input,
        }),
      });

      const data = await res.json();

      const nextResult: QuickReadResult = {
        risk: (data.risk || "").trim(),
        adjustment: (data.adjustment || "").trim(),
        fullAnalysis: (data.fullAnalysis || "").trim(),
  };

if (!nextResult.risk && !nextResult.adjustment && !nextResult.fullAnalysis) {
  setError("No response returned. Please try again.");
  return;
}

setResult(nextResult);

      const nextRuns = runsUsed + 1;
      setRunsUsed(nextRuns);
      setRunsUsedState(nextRuns);
    } catch (err) {
      setError(`Something went wrong: ${String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="rounded-3xl border border-neutral-800 bg-neutral-950/90 p-5 shadow-2xl">
      <div className="mb-4">
        <style jsx>{`
          @keyframes quickTesterScan {
            0% {
              transform: translateX(-120%);
           }
           50% {
             transform: translateX(120%);
           }
           100% {
             transform: translateX(320%);
           }
         }
       `}</style>

        <h2 className="text-2xl font-semibold tracking-tight text-neutral-100">
          Try Gravitas on one short message.
        </h2>

        <p className="mt-2 text-[16px] leading-7 text-neutral-400">
          Paste up to 500 words from an email, landing page, ad, or campaign message.
          Gravitas will show the first few reader-side signals it detects.
        </p>
      </div>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste your message here..."
        className="h-44 w-full resize-none rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-[16px] leading-7 text-neutral-100 outline-none transition focus:border-neutral-600"
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-neutral-500">
          {wordCount} / {MAX_WORDS} words
        </div>

        <button
          onClick={runQuickRead}
          disabled={isLoading || overLimit}
          className="rounded-xl border px-5 py-3 text-sm font-semibold text-black shadow-sm transition hover:scale-[1.02] hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            backgroundColor: MR_GOLD,
            borderColor: MR_GOLD,
          }}
        >
          {isLoading ? "Reading…" : "Get Quick Read"}
        </button>
      </div>

      {overLimit ? (
        <p className="mt-3 text-sm text-red-400">
          This is over the 500-word free limit. Trim it slightly or use the Day Pass for full analysis.
        </p>
      ) : null}

      {isLoading ? (
  <div className="mt-4 rounded-2xl border border-emerald-900/50 bg-emerald-950/20 px-4 py-3">
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm font-medium text-emerald-200">
        {PROCESSING_MESSAGES[processingIndex]}
      </p>

      <p className="text-xs uppercase tracking-[0.18em] text-emerald-400/70">
        Gravitas
      </p>
    </div>

    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-emerald-950">
      <div className="h-full w-1/3 animate-[quickTesterScan_1.4s_ease-in-out_infinite] rounded-full bg-emerald-400" />
    </div>
  </div>
) : null}

      {error ? (
        <p className="mt-4 rounded-2xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      {result ? (
  <div className="mt-6 space-y-4">
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 px-4 py-5">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
        Quick Gravitas Read
      </p>

      <div className="mt-5 space-y-4">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4">
          <div className="mb-2 flex items-center gap-3">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-black"
              style={{ backgroundColor: MR_GOLD }}
            >
              1
            </div>
            <h3 className="text-lg font-semibold tracking-tight text-neutral-100">
              Main reader-side risk
            </h3>
          </div>
          <p className="text-[16px] leading-7 text-neutral-300">
            {result.risk}
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4">
          <div className="mb-2 flex items-center gap-3">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-black"
              style={{ backgroundColor: MR_GOLD }}
            >
              2
            </div>
            <h3 className="text-lg font-semibold tracking-tight text-neutral-100">
              Most useful adjustment
            </h3>
          </div>
          <p className="text-[16px] leading-7 text-neutral-300">
            {result.adjustment}
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4">
          <div className="mb-2 flex items-center gap-3">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-black"
              style={{ backgroundColor: MR_GOLD }}
            >
              3
            </div>
            <h3 className="text-lg font-semibold tracking-tight text-neutral-100">
              What the full analysis would examine
            </h3>
          </div>
          <p className="text-[16px] leading-7 text-neutral-300">
            {result.fullAnalysis}
          </p>
        </div>
      </div>
    </div>

    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-5">
      <h3 className="text-lg font-semibold text-neutral-100">
        This is only the quick read.
      </h3>

      <p className="mt-2 text-[15px] leading-6 text-neutral-400">
        The Gravitas Day Pass gives you 48 hours of full access: full diagnosis,
        rewrite options, Gravitons, and image-based page or campaign review.
      </p>

      <a
        href="https://multirrupt.com/day-pass/"
        target="_top"
        className="mt-4 inline-flex rounded-xl border px-5 py-3 text-sm font-semibold text-black shadow-sm transition hover:scale-[1.02] hover:brightness-110 active:scale-[0.98]"
        style={{
          backgroundColor: MR_GOLD,
          borderColor: MR_GOLD,
        }}
      >
        Get the Day Pass — 48 hours access
      </a>
    </div>
  </div>
) : null}
    </section>
  );
}