"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Msg = { role: "user" | "assistant"; content: string };
type CopyFormat = "email" | "landing" | "social" | "document";
type RewriteVariant = {
  id: string;
  label: string;
  content: string;
  copyFormat: CopyFormat;
};

const THINKING_TOKEN = "__MR_THINKING__";
const MR_GOLD = "#C6A75A";

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function getSavedCopyFormat(): CopyFormat {
  if (typeof window === "undefined") return "email";
  const saved = window.localStorage.getItem("mr-copy-format");
  if (
    saved === "email" ||
    saved === "landing" ||
    saved === "social" ||
    saved === "document"
  ) {
    return saved;
  }
  return "email";
}

function makeRewriteLabel(index: number) {
  const letters = ["Version A", "Version B", "Version C"];
  return letters[index] || `Version ${index + 1}`;
}

function makeRewriteVariant(content: string, index: number): RewriteVariant {
  return {
    id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    label: makeRewriteLabel(index),
    content,
    copyFormat: getSavedCopyFormat(),
  };
}

async function copyElementRich(element: HTMLElement | null) {
  if (!element) return;

  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[data-copy-ui="true"]').forEach((node) => node.remove());

  try {
    if (
      navigator.clipboard &&
      "write" in navigator.clipboard &&
      typeof ClipboardItem !== "undefined"
    ) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([clone.innerHTML], {
            type: "text/html",
          }),
          "text/plain": new Blob([clone.innerText], {
            type: "text/plain",
          }),
        }),
      ]);
    } else {
      await navigator.clipboard.writeText(clone.innerText);
    }
  } catch {
    await navigator.clipboard.writeText(clone.innerText);
  }
}

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeCopyText(text: string) {
  return text.replace(/\r\n/g, "\n").trim();
}

function formatForEmail(text: string) {
  return normalizeCopyText(text)
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/\*([\s\S]+?)\*/g, "$1")
    .replace(/__([\s\S]+?)__/g, "$1")
    .replace(/_([\s\S]+?)_/g, "$1")
    .replace(/\s*[—–]\s*/g, " - ")
    .replace(/−/g, "-")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatForLanding(text: string) {
  return normalizeCopyText(text)
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/\*([\s\S]+?)\*/g, "$1")
    .replace(/__([\s\S]+?)__/g, "$1")
    .replace(/_([\s\S]+?)_/g, "$1")
    .replace(/\s*[—–]\s*/g, " - ")
    .replace(/−/g, "-")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function formatForSocial(text: string) {
  return normalizeCopyText(text)
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/\*([\s\S]+?)\*/g, "$1")
    .replace(/__([\s\S]+?)__/g, "$1")
    .replace(/_([\s\S]+?)_/g, "$1")
    .replace(/\s*[—–]\s*/g, " - ")
    .replace(/−/g, "-")
    .replace(/\. +/g, ".\n\n")
    .replace(/\?\s+/g, "?\n\n")
    .replace(/!\s+/g, "!\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatForDocument(text: string) {
  return normalizeCopyText(text)
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/\*([\s\S]+?)\*/g, "$1")
    .replace(/__([\s\S]+?)__/g, "$1")
    .replace(/_([\s\S]+?)_/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/([^\n])\n([^\n])/g, "$1 $2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatRewriteForCopy(text: string, format: CopyFormat) {
  switch (format) {
    case "landing":
      return formatForLanding(text);
    case "social":
      return formatForSocial(text);
    case "document":
      return formatForDocument(text);
    case "email":
    default:
      return formatForEmail(text);
  }
}

function textToHtmlParagraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => {
      const safe = escapeHtml(paragraph).replace(/\n/g, "<br>");
      return `<p>${safe}</p>`;
    })
    .join("");
}

async function copyFormattedTextRich(text: string, format: CopyFormat) {
  const formatted = formatRewriteForCopy(text, format);
  const html = textToHtmlParagraphs(formatted);

  try {
    if (
      navigator.clipboard &&
      "write" in navigator.clipboard &&
      typeof ClipboardItem !== "undefined"
    ) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], {
            type: "text/html",
          }),
          "text/plain": new Blob([formatted], {
            type: "text/plain",
          }),
        }),
      ]);
    } else {
      await navigator.clipboard.writeText(formatted);
    }
  } catch {
    await navigator.clipboard.writeText(formatted);
  }
}

function stripMarkdownWrapper(text: string) {
  return text
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .replace(/^__(.+)__$/, "$1")
    .replace(/[：:]+$/g, "")
    .trim();
}

function normalizeSectionLabel(text: string) {
  return stripMarkdownWrapper(text)
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getSectionKind(
  line: string
): "summary" | "depth" | "rewrite" | "debrief" | null {
  const t = normalizeSectionLabel(line);

  if (
    t === "executive summary" ||
    t === "editors summary" ||
    t === "editor summary"
  ) {
    return "summary";
  }

  if (
    t === "diagnosis in depth" ||
    t === "editors notes in depth" ||
    t === "editor notes in depth"
  ) {
    return "depth";
  }

  if (t === "rewrite") {
    return "rewrite";
  }

  if (
    t === "rewrite debrief" ||
    t === "editors debrief" ||
    t === "editor debrief" ||
    t === "editors final rewrite notes" ||
    t === "editor final rewrite notes"
  ) {
    return "debrief";
  }

  return null;
}

function parseStructuredMR(content: string) {
  const lines = content.split(/\r?\n/);

  type Kind = "summary" | "depth" | "rewrite" | "debrief";
  const sections: Partial<Record<Kind, string>> = {};
  const order: Kind[] = [];

  let current: Kind | null = null;
  let buffer: string[] = [];

  function flush() {
    if (!current) return;
    const text = buffer.join("\n").trim();
    if (text) {
      sections[current] = text;
      if (!order.includes(current)) order.push(current);
    }
    buffer = [];
  }

  for (const rawLine of lines) {
    const kind = getSectionKind(rawLine);
    if (kind) {
      flush();
      current = kind;
      continue;
    }
    buffer.push(rawLine);
  }

  flush();

  const hasStructured =
    Boolean(sections.summary) ||
    Boolean(sections.depth) ||
    Boolean(sections.rewrite) ||
    Boolean(sections.debrief);

  return { hasStructured, sections, order };
}

function renderMR(content: string) {
  const lines = content.split(/\r?\n/);

  type Node =
    | { type: "heading"; level: number; text: string; key: string }
    | { type: "hr"; key: string }
    | { type: "quote"; lines: string[]; key: string }
    | { type: "list"; items: string[]; key: string }
    | { type: "para"; text: string; key: string }
    | { type: "spacer"; key: string };

  const nodes: Node[] = [];
  let i = 0;

  const pushSpacerIfNeeded = () => {
    const prev = nodes[nodes.length - 1];
    if (prev && prev.type !== "spacer") {
      nodes.push({ type: "spacer", key: `s-${i}-${nodes.length}` });
    }
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      pushSpacerIfNeeded();
      i++;
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const text = (h[2] ?? "").trim();
      nodes.push({ type: "heading", level, text, key: `h-${i}` });
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,})\s*$/.test(trimmed)) {
      nodes.push({ type: "hr", key: `hr-${i}` });
      i++;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test((lines[i] ?? "").trim())) {
        q.push((lines[i] ?? "").trim().replace(/^>\s?/, ""));
        i++;
      }
      nodes.push({ type: "quote", lines: q, key: `q-${i}-${q.length}` });
      continue;
    }

    if (/^(-|•)\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^(-|•)\s+/.test((lines[i] ?? "").trim())) {
        items.push((lines[i] ?? "").trim().replace(/^(-|•)\s+/, ""));
        i++;
      }
      nodes.push({ type: "list", items, key: `ul-${i}-${items.length}` });
      continue;
    }

    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i] ?? "";
      const t = l.trim();
      if (!t) break;
      if (/^(#{1,6})\s+/.test(l)) break;
      if (/^(-{3,}|\*{3,})\s*$/.test(t)) break;
      if (/^>\s?/.test(t)) break;
      if (/^(-|•)\s+/.test(t)) break;
      para.push(l);
      i++;
    }
    nodes.push({
      type: "para",
      text: para.join("\n").trim(),
      key: `p-${i}-${para.length}`,
    });
  }

  function renderInline(text: string) {
    const tokens = text
      .split(/(`[^`]+`|\*\*[\s\S]+?\*\*|\*[^*]+\*)/g)
      .filter(Boolean);

    return tokens.map((token, idx) => {
      const codeMatch = token.match(/^`([^`]+)`$/);
      if (codeMatch) {
        return (
          <code
            key={idx}
            className="rounded-md border border-neutral-800 bg-neutral-900/50 px-1.5 py-0.5 text-[0.95em] text-neutral-200"
          >
            {codeMatch[1]}
          </code>
        );
      }

      const boldMatch = token.match(/^\*\*([\s\S]+)\*\*$/);
      if (boldMatch) {
        return (
          <strong key={idx} className="font-semibold text-neutral-100">
            {boldMatch[1]}
          </strong>
        );
      }

      const italicMatch = token.match(/^\*([\s\S]+)\*$/);
      if (italicMatch) {
        return (
          <em key={idx} className="italic">
            {italicMatch[1]}
          </em>
        );
      }

      return <span key={idx}>{token}</span>;
    });
  }

  return (
    <div className="space-y-0">
      {nodes.map((n) => {
        if (n.type === "spacer") return <div key={n.key} className="h-3" />;

        if (n.type === "hr") {
          return (
            <div key={n.key} className="py-4">
              <div className="h-px w-full bg-neutral-800/80" />
            </div>
          );
        }

        if (n.type === "heading") {
          const level = Math.min(n.level, 6);
          const cls =
            level === 1
              ? "text-[22px] font-semibold"
              : level === 2
                ? "text-[20px] font-semibold"
                : "text-[18px] font-semibold";

          const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;

          return (
            <Tag
              key={n.key}
              className={classNames(
                "mt-6 first:mt-0 tracking-tight text-neutral-100",
                cls
              )}
            >
              {renderInline(n.text)}
            </Tag>
          );
        }

        if (n.type === "quote") {
          return (
            <blockquote
              key={n.key}
              className="my-2 rounded-xl border-l-2 border-neutral-700 bg-neutral-900/25 px-4 py-3 text-neutral-200"
            >
              <div className="space-y-2">
                {n.lines.map((q, idx) => (
                  <p key={idx} className="text-[17px] leading-7">
                    {renderInline(q)}
                  </p>
                ))}
              </div>
            </blockquote>
          );
        }

        if (n.type === "list") {
          return (
            <ul key={n.key} className="my-2 list-disc space-y-1 pl-6 text-neutral-200">
              {n.items.map((it, idx) => (
                <li key={idx} className="text-[17px] leading-7">
                  {renderInline(it)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={n.key} className="my-2 text-[17px] leading-7 text-neutral-200">
            {n.text.split("\n").map((line, idx, arr) => (
              <span key={idx}>
                {renderInline(line)}
                {idx < arr.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function ThinkingStatus() {
  const steps = [
    "Reading message structure…",
    "Assessing narrative flow…",
    "Checking clarity and friction points…",
    "Evaluating persuasion dynamics…",
    "Examining audience perception…",
    "Mapping argument coherence…",
    "Reviewing emotional cadence…",
    "Analysing Momentum…",
  ];

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const nextDelay = () => {
      const roll = Math.random();

      if (roll < 0.15) return 2800 + Math.floor(Math.random() * 300);
      if (roll < 0.75) return 1600 + Math.floor(Math.random() * 900);
      return 1000 + Math.floor(Math.random() * 700);
    };

    const scheduleNext = () => {
      timer = setTimeout(() => {
        if (cancelled) return;
        setIdx((n) => (n + 1) % steps.length);
        scheduleNext();
      }, nextDelay());
    };

    scheduleNext();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return <span className="italic text-emerald-200/80">{steps[idx]}</span>;
}

function StructuredAssistantMessage({
  content,
  sourceRaw,
}: {
  content: string;
  sourceRaw: string;
}) {
  const { hasStructured, sections } = useMemo(() => parseStructuredMR(content), [content]);
  const rewriteSectionRef = useRef<HTMLElement | null>(null);
  const newestRewriteRef = useRef<HTMLDivElement | null>(null);
  const [showRewrite, setShowRewrite] = useState(false);
  const [showRewriteButton, setShowRewriteButton] = useState(false);
  const [rewriteState, setRewriteState] = useState<"idle" | "working">("idle");
  const [copiedRewriteId, setCopiedRewriteId] = useState<string | null>(null);
  const [rewrites, setRewrites] = useState<RewriteVariant[]>([]);
  const [isGeneratingAlternate, setIsGeneratingAlternate] = useState(false);

  const summary = sections.summary?.trim();
  const depth = sections.depth?.trim();
  const rewrite = sections.rewrite?.trim();
  const debrief = sections.debrief?.trim();

  useEffect(() => {
    setShowRewrite(false);
    setShowRewriteButton(false);
    setRewriteState("idle");
    setCopiedRewriteId(null);
    setIsGeneratingAlternate(false);

    if (rewrite) {
      setRewrites([makeRewriteVariant(rewrite, 0)]);
    } else {
      setRewrites([]);
    }

    const id = setTimeout(() => {
      setShowRewriteButton(true);
    }, 700);

    return () => clearTimeout(id);
  }, [content, rewrite]);

  useEffect(() => {
    if (showRewrite && rewrites.length > 1) {
      setTimeout(() => {
        newestRewriteRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 120);
    }
  }, [rewrites.length, showRewrite]);

  function handleFormatChange(rewriteId: string, value: CopyFormat) {
    window.localStorage.setItem("mr-copy-format", value);
    setRewrites((prev) =>
      prev.map((rw) =>
        rw.id === rewriteId ? { ...rw, copyFormat: value } : rw
      )
    );
  }

  function formatLabel(format: CopyFormat) {
    return format === "landing"
      ? "Landing Page"
      : format === "social"
        ? "Social"
        : format === "document"
          ? "Document"
          : "Email";
  }

  const revealRewrite = () => {
    setTimeout(() => {
      setShowRewrite(true);
      setTimeout(() => {
        rewriteSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }, 300);
  };

  const handleRewriteClick = () => {
    setRewriteState("working");
    setTimeout(() => {
      revealRewrite();
    }, 450);
  };

  async function handleCopyRewrite(variant: RewriteVariant) {
    await copyFormattedTextRich(variant.content, variant.copyFormat);
    setCopiedRewriteId(variant.id);
    setTimeout(() => {
      setCopiedRewriteId((current) => (current === variant.id ? null : current));
    }, 2000);
  }

  async function handleRewriteAgain() {
    if (rewrites.length >= 3 || isGeneratingAlternate) return;

    const parsed = parseCommand(sourceRaw);
    if (!parsed.content.trim()) return;

    setIsGeneratingAlternate(true);

    const alternateInstruction =
      "Provide only a fresh alternate rewrite of this same original text. Do not include summary, diagnosis, notes, headings, labels, or debrief. Return only the rewritten copy.";

    const payload =
      parsed.mode === "mr_heresy"
        ? {
            mode: "mr_heresy",
            input: " ",
            context: `${alternateInstruction}\n\nApply Multirrupt Mode to the following text:\n\n${parsed.content}`,
            constraints: {},
          }
        : {
            mode: "general",
            input: parsed.content,
            context: alternateInstruction,
            constraints: {},
          };

    try {
      const res = await fetch("/api/mr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      const rawOutput = (data.output || "").trim();
      if (!rawOutput) return;

      const parsedAlt = parseStructuredMR(rawOutput);
      const alternateRewrite =
        parsedAlt.sections.rewrite?.trim() || rawOutput;

      setRewrites((prev) => {
        if (prev.length >= 3) return prev;
        return [...prev, makeRewriteVariant(alternateRewrite, prev.length)];
      });
    } catch {
      // no-op for now
    } finally {
      setIsGeneratingAlternate(false);
    }
  }

  if (!hasStructured) {
    return <div className="text-[17px] leading-7">{renderMR(content)}</div>;
  }

  return (
    <div className="space-y-5">
      {summary ? (
        <section>
          <h2 className="text-[20px] font-semibold tracking-tight text-neutral-100">
            Editor’s Summary
          </h2>
          <div className="mt-3">{renderMR(summary)}</div>

          {rewrite && !showRewrite && showRewriteButton ? (
            <div
              className={classNames(
                "mt-5 transition-all duration-500",
                showRewriteButton ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
              )}
            >
              <button
                onClick={handleRewriteClick}
                data-copy-ui="true"
                className={classNames(
                  "rounded-xl border px-6 py-3 text-sm font-semibold tracking-wide text-black shadow-sm transition-all duration-300 hover:scale-[1.02] hover:brightness-110 active:scale-[0.98]",
                  rewriteState === "working" && "animate-pulse"
                )}
                style={{
                  backgroundColor: MR_GOLD,
                  borderColor: MR_GOLD,
                }}
              >
                {rewriteState === "working" ? "Rewriting…" : "Rewrite"}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {depth ? (
        <details className="rounded-2xl border border-neutral-800 bg-neutral-900/20">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-neutral-300 marker:hidden">
            <div className="flex items-center justify-between gap-4">
              <span>Editor’s Notes in Depth</span>
              <span className="text-xs uppercase tracking-widest text-neutral-500">
                Click to expand
              </span>
            </div>
          </summary>
          <div className="border-t border-neutral-800 px-4 py-4">
            {renderMR(depth)}
          </div>
        </details>
      ) : null}

      {showRewrite && rewrites.length > 0 ? (
        <section
          ref={rewriteSectionRef}
          className={classNames(
            "rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-5 transition-all duration-500",
            showRewrite ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
          )}
        >
          <h2
            className="mb-2 text-[20px] font-semibold tracking-tight"
            style={{ color: MR_GOLD }}
          >
            Rewrite
          </h2>

          {rewrites.map((variant, idx) => (
            <div
              key={variant.id}
              ref={idx === rewrites.length - 1 ? newestRewriteRef : null}
              className={idx === rewrites.length - 1 ? "" : "mb-10"}
            >
              <div
                className="mb-6 h-[2px] rounded-full"
                style={{ backgroundColor: MR_GOLD }}
              />

              <div className="mb-4 flex items-center justify-between gap-3">
                <h3
                  className="text-[20px] font-semibold tracking-tight"
                  style={{ color: MR_GOLD }}
                >
                  {variant.label}
                </h3>

                <div className="flex items-center gap-2" data-copy-ui="true">
                  <button
                    onClick={() => handleCopyRewrite(variant)}
                    className="rounded-xl border px-4 py-2 text-sm font-semibold text-black shadow-sm transition-all duration-300 hover:scale-[1.02] hover:brightness-110 active:scale-[0.98]"
                    style={{
                      backgroundColor: MR_GOLD,
                      borderColor: MR_GOLD,
                    }}
                  >
                    {copiedRewriteId === variant.id
                      ? `✓ Copied (${formatLabel(variant.copyFormat)})`
                      : "Copy Rewrite"}
                  </button>

                  <label className="sr-only" htmlFor={`mr-copy-format-${variant.id}`}>
                    Copy format
                  </label>
                  <select
                    id={`mr-copy-format-${variant.id}`}
                    value={variant.copyFormat}
                    onChange={(e) =>
                      handleFormatChange(variant.id, e.target.value as CopyFormat)
                    }
                    className="h-[42px] rounded-xl border border-neutral-800 bg-neutral-900 px-3 pr-8 text-sm font-medium text-neutral-200 outline-none transition hover:border-neutral-600 focus:border-neutral-500 appearance-none"
                    style={{
                      backgroundImage:
                        "linear-gradient(45deg, transparent 50%, #a3a3a3 50%), linear-gradient(135deg, #a3a3a3 50%, transparent 50%)",
                      backgroundPosition:
                        "calc(100% - 18px) calc(50% - 3px), calc(100% - 12px) calc(50% - 3px)",
                      backgroundSize: "6px 6px, 6px 6px",
                      backgroundRepeat: "no-repeat",
                    }}
                  >
                    <option value="email">Email</option>
                    <option value="landing">Landing Page</option>
                    <option value="social">Social</option>
                    <option value="document">Document</option>
                  </select>
                </div>
              </div>

              <div
                className={classNames(
                  "transition-all duration-700 delay-100",
                  showRewrite ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
                )}
              >
                {renderMR(variant.content)}
              </div>
            </div>
          ))}

          {rewrites.length < 3 ? (
            <div className="mt-8 flex justify-start" data-copy-ui="true">
              <button
                onClick={handleRewriteAgain}
                className={classNames(
                  "rounded-xl border px-4 py-2 text-sm font-semibold transition",
                  isGeneratingAlternate && "animate-pulse"
                )}
                style={{
                  color: MR_GOLD,
                  borderColor: `${MR_GOLD}99`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = `${MR_GOLD}1A`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                {isGeneratingAlternate ? "Rewriting…" : "Rewrite Again"}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {debrief && showRewrite ? (
        <section>
          <h2 className="text-[20px] font-semibold tracking-tight text-neutral-100">
            Editor’s Debrief
          </h2>
          <div className="mt-3">{renderMR(debrief)}</div>
        </section>
      ) : null}
    </div>
  );
}

function parseCommand(raw: string): { mode: "general" | "mr_heresy"; content: string } {
  const text = raw.trim();
  if (!text) return { mode: "general", content: "" };

  const m = text.match(/^\/(h|heresy)\b\s*([\s\S]*)$/i);
  if (m) {
    const content = (m[2] ?? "").trim();
    return { mode: "mr_heresy", content };
  }

  return { mode: "general", content: text };
}

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(null);
  const [isSubscribed, setIsSubscribed] = useState<boolean | null>(null);
  const [demoUsed, setDemoUsed] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const messageContentRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const router = useRouter();
  const supabase = createClient();
  const sendLockRef = useRef(false);

  const isDemoLocked = isSubscribed === false && demoUsed;

  const canSend = useMemo(
    () => draft.trim().length > 0 && !isLoading && !isDemoLocked,
    [draft, isLoading, isDemoLocked]
  );

  function scrollToBottom() {
    setTimeout(() => {
      const el = scrollerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  useEffect(() => {
    async function checkSubscription() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIsSubscribed(false);
        return;
      }

      const { data } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1);

      setIsSubscribed(!!data && data.length > 0);
    }

    checkSubscription();
  }, [supabase]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function handleSubscribe() {
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("Unable to start Stripe checkout.");
      }
    } catch {
      alert("Something went wrong starting checkout.");
    }
  }

  async function onCopyMessage(index: number) {
    const el = messageContentRefs.current[index] ?? null;
    await copyElementRich(el);
    setCopiedMessageIndex(index);
    setTimeout(() => {
      setCopiedMessageIndex((current) => (current === index ? null : current));
    }, 2000);
  }

  async function onCopyAll() {
    if (messages.length === 0) return;

    const wrapper = document.createElement("div");
    let firstVisibleBlock = true;

    messages.forEach((m, i) => {
      if (m.role === "assistant" && m.content === THINKING_TOKEN) return;

      const el = messageContentRefs.current[i];
      if (!el) return;

      if (!firstVisibleBlock) {
        const divider = document.createElement("div");
        divider.innerText = "———";
        divider.style.textAlign = "center";
        divider.style.margin = "20px 0";
        divider.style.color = "#666";
        divider.style.fontSize = "14px";
        wrapper.appendChild(divider);
      }

      const block = document.createElement("div");
      block.style.marginBottom = "28px";

      const body = document.createElement("div");
      body.innerHTML = el.innerHTML;

      block.appendChild(body);
      wrapper.appendChild(block);

      firstVisibleBlock = false;
    });

    await copyElementRich(wrapper);

    setCopiedAll(true);
    setTimeout(() => {
      setCopiedAll(false);
    }, 2000);
  }

  function onClear() {
    if (isLoading) return;
    setMessages([]);
    setDraft("");
    setCopiedAll(false);
    setCopiedMessageIndex(null);
    messageContentRefs.current = {};
  }

  async function onSend() {
    if (sendLockRef.current) return;

    const raw = draft;
    if (!raw.trim() || isLoading || isDemoLocked) return;

    if (raw.length > 8000) {
      alert("Please limit input to 8,000 characters.");
      return;
    }

    sendLockRef.current = true;
    const parsed = parseCommand(raw);
    const text = parsed.content;

    if (!text) {
      sendLockRef.current = false;
      setDraft("");
      setMessages((m) => [
        ...m,
        { role: "user", content: raw.trim() },
        {
          role: "assistant",
          content: "Heresy mode: paste the text after /h (e.g. “/h <paste text>”).",
        },
      ]);
      return;
    }

    setDraft("");
    setIsLoading(true);

    setMessages((m) => [
      ...m,
      { role: "user", content: raw.trim() },
      { role: "assistant", content: THINKING_TOKEN },
    ]);

    scrollToBottom();

    const isHeresy = parsed.mode === "mr_heresy";

    const payload = isHeresy
      ? {
          mode: "mr_heresy",
          input: " ",
          context: `Apply Multirrupt Mode to the following text:\n\n${text}`,
          constraints: {},
        }
      : {
          mode: "general",
          input: text,
          context: "",
          constraints: {},
        };

    try {
      const res = await fetch("/api/mr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      setMessages((m) =>
        m.map((msg) =>
          msg.role === "assistant" && msg.content === THINKING_TOKEN
            ? { role: "assistant", content: data.output || "No response." }
            : msg
        )
      );

      if (isSubscribed === false) {
        setDemoUsed(true);
      }
    } catch {
      setMessages((m) =>
        m.map((msg) =>
          msg.role === "assistant" && msg.content === THINKING_TOKEN
            ? { role: "assistant", content: "Something went wrong while analysing." }
            : msg
        )
      );
    } finally {
      sendLockRef.current = false;
      setIsLoading(false);
      scrollToBottom();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  if (isSubscribed === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-100">
        Checking subscription...
      </main>
    );
  }

  if (!isSubscribed) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-6 text-center text-neutral-100">
        <h1 className="mb-4 text-3xl font-semibold">Gravitas</h1>

        <p className="mb-6 max-w-xl text-neutral-300">
          Gravitas requires an active subscription.
          Subscribe to continue using the narrative diagnostics and rewrite engine.
        </p>

        <div className="flex gap-4">
          <button
            onClick={handleSubscribe}
            className="rounded bg-black px-4 py-2 text-white"
          >
            Subscribe
          </button>

          <button
            onClick={handleLogout}
            className="rounded border border-neutral-600 px-6 py-3"
          >
            Logout
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-2xl font-semibold tracking-tight">
              Multirrupt - GRAVITAS
            </div>
            <div className="mt-1 text-sm text-neutral-400">
              Narrative Intelligence for Momentum, Flow, and Perception.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onCopyAll}
              data-copy-ui="true"
              disabled={messages.length === 0}
              className="rounded-xl border border-neutral-800 px-3 py-2 text-sm hover:bg-neutral-900 disabled:cursor-not-allowed disabled:text-neutral-600"
            >
              {copiedAll ? "✓ Copied" : "Copy all"}
            </button>
            <button
              onClick={onClear}
              data-copy-ui="true"
              disabled={messages.length === 0 || isLoading}
              className="rounded-xl border border-neutral-800 px-3 py-2 text-sm hover:bg-neutral-900 disabled:cursor-not-allowed disabled:text-neutral-600"
            >
              Clear
            </button>
            <button
              onClick={handleLogout}
              data-copy-ui="true"
              className="rounded-xl border border-neutral-800 px-3 py-2 text-sm hover:bg-neutral-900"
            >
              Logout
            </button>
          </div>
        </header>

        <div
          ref={scrollerRef}
          className="h-[60vh] overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
        >
          {messages.length === 0 ? (
            <div className="text-[17px] leading-7 text-neutral-400">
              Start by pasting an email, landing page, ad, article, or any text you want reviewed.
              <div className="mt-2 text-neutral-600">
                Tip: <span className="text-neutral-400">Enter</span> sends,{" "}
                <span className="text-neutral-400">Shift+Enter</span> makes a new line.
              </div>
              <div className="mt-2 text-neutral-700"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m, i) => {
                const isThinking =
                  m.role === "assistant" && m.content === THINKING_TOKEN;
                const sourceRaw =
                  m.role === "assistant" && i > 0 && messages[i - 1]?.role === "user"
                    ? messages[i - 1].content
                    : "";

                return (
                  <div
                    key={i}
                    className={classNames(
                      "group rounded-2xl border px-4 py-4",
                      m.role === "user"
                        ? "border-neutral-800 bg-neutral-900/40"
                        : isThinking
                          ? "border-emerald-900/60 bg-emerald-900/15"
                          : "border-neutral-800 bg-neutral-900/20"
                    )}
                  >
                    <div
                      data-copy-ui="true"
                      className="mb-3 flex items-center justify-between"
                    >
                      <div className="text-xs uppercase tracking-widest text-neutral-400">
                        {m.role === "user" ? "You" : "MR"}
                      </div>
                      <button
                        onClick={() => onCopyMessage(i)}
                        data-copy-ui="true"
                        disabled={isThinking}
                        className="rounded-lg border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:text-neutral-600"
                      >
                        {copiedMessageIndex === i ? "✓ Copied" : "Copy"}
                      </button>
                    </div>

                    <div
                      ref={(el) => {
                        messageContentRefs.current[i] = el;
                      }}
                      className="text-[17px] leading-7"
                    >
                      {isThinking ? (
                        <ThinkingStatus />
                      ) : m.role === "assistant" ? (
                        <StructuredAssistantMessage
                          content={m.content}
                          sourceRaw={sourceRaw}
                        />
                      ) : (
                        renderMR(m.content)
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
          <div className="flex gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={isDemoLocked}
              placeholder="Paste your text here…"
              className={classNames(
                "h-[56px] w-full resize-none rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-[17px] leading-7 text-neutral-100 outline-none focus:border-neutral-600",
                isDemoLocked && "cursor-not-allowed opacity-60"
              )}
            />
            <button
              onClick={onSend}
              data-copy-ui="true"
              disabled={!canSend}
              className="h-[56px] rounded-xl bg-neutral-100 px-5 text-sm font-semibold text-neutral-950 hover:bg-white disabled:bg-neutral-800 disabled:text-neutral-500"
            >
              Review
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}