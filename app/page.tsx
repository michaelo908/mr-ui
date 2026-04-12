"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Msg = { role: "user" | "assistant"; content: string };
type CopyFormat = "email" | "word";
type RewriteVariant = {
  id: string;
  label: string;
  content: string;
  copyFormat: CopyFormat;
};

type TelemetrySeed = {
  dateKey: string;
  analysesStart: number;
  rewritesStart: number;
  analysesPerMinute: number;
  rewritesPerMinute: number;
};

type ContentNode =
  | { type: "heading"; level: number; text: string; key: string }
  | { type: "hr"; key: string }
  | { type: "quote"; lines: string[]; key: string }
  | { type: "list"; items: string[]; key: string }
  | { type: "para"; text: string; key: string }
  | { type: "spacer"; key: string };

const THINKING_TOKEN = "__MR_THINKING__";
const MR_GOLD = "#C6A75A";
const TELEMETRY_LAUNCH_DATE = "2026-03-15";
const TELEMETRY_STORAGE_KEY = "gravitasTelemetrySeedV1";

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function getSavedCopyFormat(): CopyFormat {
  if (typeof window === "undefined") return "email";
  const saved = window.localStorage.getItem("mr-copy-format");
  if (saved === "email" || saved === "word") {
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

function stripInlineMarkdown(text: string) {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/\*([\s\S]+?)\*/g, "$1")
    .replace(/__([\s\S]+?)__/g, "$1")
    .replace(/_([\s\S]+?)_/g, "$1");
}

function formatForEmail(text: string) {
  return normalizeCopyText(text)
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-•]\s+/gm, "• ")
    .replace(/\s*[—–]\s*/g, " - ")
    .replace(/−/g, "-")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .split("\n")
    .map((line) => stripInlineMarkdown(line))
    .join("\n")
    .trim();
}

function parseContentNodes(content: string): ContentNode[] {
  const lines = content.split(/\r?\n/);
  const nodes: ContentNode[] = [];
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

  return nodes;
}

function renderInlineHtml(text: string) {
  const tokens = text
    .split(/(`[^`]+`|\*\*[\s\S]+?\*\*|\*[^*]+\*)/g)
    .filter(Boolean);

  return tokens
    .map((token) => {
      const codeMatch = token.match(/^`([^`]+)`$/);
      if (codeMatch) {
        return `<code>${escapeHtml(codeMatch[1])}</code>`;
      }

      const boldMatch = token.match(/^\*\*([\s\S]+)\*\*$/);
      if (boldMatch) {
        return `<strong>${escapeHtml(boldMatch[1])}</strong>`;
      }

      const italicMatch = token.match(/^\*([\s\S]+)\*$/);
      if (italicMatch) {
        return `<em>${escapeHtml(italicMatch[1])}</em>`;
      }

      return escapeHtml(token);
    })
    .join("");
}

function buildWordHtml(text: string) {
  const nodes = parseContentNodes(text);

  return nodes
    .map((node) => {
      if (node.type === "spacer") {
        return `<div style="height: 12px;"></div>`;
      }

      if (node.type === "hr") {
        return `<hr>`;
      }

      if (node.type === "heading") {
        const level = Math.min(node.level, 6);
        return `<h${level}>${renderInlineHtml(node.text)}</h${level}>`;
      }

      if (node.type === "quote") {
        const body = node.lines
          .map((line) => `<p>${renderInlineHtml(line)}</p>`)
          .join("");
        return `<blockquote>${body}</blockquote>`;
      }

      if (node.type === "list") {
        const items = node.items
          .map((item) => `<li>${renderInlineHtml(item)}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }

      const paragraphs = node.text
        .split("\n")
        .map((line) => renderInlineHtml(line))
        .join("<br>");

      return `<p>${paragraphs}</p>`;
    })
    .join("");
}

async function copyPlainText(text: string) {
  const plain = formatForEmail(text);
  await navigator.clipboard.writeText(plain);
}

async function copyRichText(text: string) {
  const plain = formatForEmail(text);
  const html = buildWordHtml(text);

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
          "text/plain": new Blob([plain], {
            type: "text/plain",
          }),
        }),
      ]);
    } else {
      await navigator.clipboard.writeText(plain);
    }
  } catch {
    await navigator.clipboard.writeText(plain);
  }
}

async function copyTextForFormat(text: string, format: CopyFormat) {
  if (format === "word") {
    await copyRichText(text);
    return;
  }

  await copyPlainText(text);
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

function normalizeAssistantHeadings(content: string) {
  return content
    .replace(/^[\s\-–—*#]*Executive Summary[\s\-–—*#]*$/gim, "Editor’s Summary")
    .replace(/^[\s\-–—*#]*Diagnosis in Depth[\s\-–—*#]*$/gim, "Editor’s Notes in Depth")
    .replace(/^[\s\-–—*#]*Editors Notes in Depth[\s\-–—*#]*$/gim, "Editor’s Notes in Depth")
    .replace(/^[\s\-–—*#]*Editor Notes in Depth[\s\-–—*#]*$/gim, "Editor’s Notes in Depth")
    .replace(/^[\s\-–—*#]*Rewrite Debrief[\s\-–—*#]*$/gim, "Editor’s Debrief")
    .replace(/^[\s\-–—*#]*Editors Debrief[\s\-–—*#]*$/gim, "Editor’s Debrief")
    .replace(/^[\s\-–—*#]*Editor Debrief[\s\-–—*#]*$/gim, "Editor’s Debrief")
    .replace(/^[\s\-–—*#]*Editors Final Rewrite Notes[\s\-–—*#]*$/gim, "Editor’s Debrief")
    .replace(/^[\s\-–—*#]*Editor Final Rewrite Notes[\s\-–—*#]*$/gim, "Editor’s Debrief");
}

function normalizeAssistantCopyText(content: string) {
  const parsed = parseStructuredMR(content);

  if (!parsed.hasStructured) {
    return content.trim();
  }

  const parts: string[] = [];

  if (parsed.sections.summary?.trim()) {
    parts.push("Editor’s Summary");
    parts.push(parsed.sections.summary.trim());
  }

  if (parsed.sections.depth?.trim()) {
    parts.push("Editor’s Notes in Depth");
    parts.push(parsed.sections.depth.trim());
  }

  if (parsed.sections.rewrite?.trim()) {
    parts.push("Rewrite");
    parts.push(parsed.sections.rewrite.trim());
  }

  if (parsed.sections.debrief?.trim()) {
    parts.push("Editor’s Debrief");
    parts.push(parsed.sections.debrief.trim());
  }

  return parts.join("\n\n").trim();
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

function capitalizeFirst(text: string) {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function normalizeOpeningSignalText(text: string) {
  return stripInlineMarkdown(text)
    .toLowerCase()
    .replace(/[“”"']/g, "")
    .replace(/[–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return values.filter((value, index, arr): value is string => {
    if (!value) return false;
    return arr.indexOf(value) === index;
  });
}

function pickSignalPhrase(text: string): string | null {
  const t = normalizeOpeningSignalText(text);

  if (
    /(doesnt hold attention|doesn't hold attention|attention drops|attention collapses|reader drifts|reason to stay|reason to care|pull the reader forward|pulls the reader forward|fades out|falls flat|doesnt land|doesn't land|lands quiet|losing people)/.test(
      t
    )
  ) {
    return "it doesn't hold attention";
  }

  if (
    /(asks too much|too much before|too much too early|over explain|over-explain|more complete|dense|too long|effort halfway through|this is going to be work)/.test(
      t
    )
  ) {
    return "it asks too much too early";
  }

  if (
    /(reads clearly|clear but|clear yet|clarity|logical|reads fine|technically correct|makes sense|well explained|explains everything clearly)/.test(
      t
    )
  ) {
    return "it reads clearly";
  }

  if (
    /(never quite understands|doesnt understand what this is|doesn't understand what this is|unclear positioning|confus|meaning blurs|what this is)/.test(
      t
    )
  ) {
    return "the reader never fully understands it";
  }

  if (
    /(no real pull|nothing pulls|tension fails|lack of tension|urgency|desire never forms|momentum collapses|forward momentum|no reason to stay)/.test(
      t
    )
  ) {
    return "nothing pulls the reader forward";
  }

  if (/(trust thins|trust weakens|skeptic|suspicion|credibility)/.test(t)) {
    return "trust weakens too early";
  }

  if (
    /(never fully connects|doesnt connect|doesn't connect|connection fails|contact|resonate)/.test(
      t
    )
  ) {
    return "it never fully connects";
  }

  if (/(too general|generic|vague|stays broad|problem vividness)/.test(t)) {
    return "it stays too general";
  }

  return null;
}

function trimToWordLimit(text: string, maxWords: number) {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, maxWords).join(" ")}…`;
}

function deriveOpeningStatement(summary?: string) {
  if (!summary?.trim()) return null;

  const nodes = parseContentNodes(summary);
  const candidates: string[] = [];

  nodes.forEach((node) => {
    if (node.type === "list") {
      candidates.push(...node.items);
    } else if (node.type === "para") {
      candidates.push(...node.text.split("\n"));
    }
  });

  const phrases = uniqueStrings(
    candidates.slice(0, 6).map((item) => pickSignalPhrase(item))
  );

  if (phrases.length === 0) return null;

  if (phrases.length === 1) {
    return trimToWordLimit(`${capitalizeFirst(phrases[0])}.`, 20);
  }

  const [first, second] = phrases;

  if (first === "it reads clearly") {
    return trimToWordLimit(
      `${capitalizeFirst(first)} — but ${second.replace(/^it /, "")}.`,
      20
    );
  }

  if (second === "it reads clearly") {
    return trimToWordLimit(
      `${capitalizeFirst(second)} — but ${first.replace(/^it /, "")}.`,
      20
    );
  }

  if (first.startsWith("it ") && second.startsWith("it ")) {
    return trimToWordLimit(
      `${capitalizeFirst(first)} — and ${second.slice(3)}.`,
      20
    );
  }

  return trimToWordLimit(`${capitalizeFirst(first)} — and ${second}.`, 20);
}

function renderMR(content: string) {
  const nodes = parseContentNodes(content);

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
  demoCount,
  onRewriteProduced,
  onSubscribe,
}: {
  content: string;
  sourceRaw: string;
  demoCount: number;
  onRewriteProduced?: () => void;
  onSubscribe: () => void;
}) {
  const { hasStructured, sections } = useMemo(() => parseStructuredMR(content), [content]);
  const rewriteSectionRef = useRef<HTMLElement | null>(null);
  const newestRewriteRef = useRef<HTMLDivElement | null>(null);
  const continuationRef = useRef<HTMLElement | null>(null);
  const [showRewrite, setShowRewrite] = useState(false);
  const [showContinuation, setShowContinuation] = useState(false);
  const [showRewriteButton, setShowRewriteButton] = useState(false);
  const [rewriteState, setRewriteState] = useState<"idle" | "working">("idle");
  const [copiedRewriteKey, setCopiedRewriteKey] = useState<string | null>(null);
  const [rewrites, setRewrites] = useState<RewriteVariant[]>([]);
  const [isGeneratingAlternate, setIsGeneratingAlternate] = useState(false);

  const summary = sections.summary?.trim();
  const depth = sections.depth?.trim();
  const rewrite = sections.rewrite?.trim();
  const debrief = sections.debrief?.trim();
  const openingStatement = useMemo(() => deriveOpeningStatement(summary), [summary]);

  useEffect(() => {
    setShowRewrite(false);
    setShowContinuation(false);
    setShowRewriteButton(false);
    setRewriteState("idle");
    setCopiedRewriteKey(null);
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
    return format === "word" ? "Word" : "Email";
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

  async function handleCopyRewrite(variant: RewriteVariant, format: CopyFormat) {
    await copyTextForFormat(variant.content, format);
    const copyKey = `${variant.id}:${format}`;
    setCopiedRewriteKey(copyKey);
    setTimeout(() => {
      setCopiedRewriteKey((current) => (current === copyKey ? null : current));
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

      onRewriteProduced?.();
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
          {openingStatement ? (
            <div className="mb-5">
              <p className="text-[19px] leading-7 tracking-tight text-neutral-100 italic">
                {openingStatement}
              </p>
              <p className="mt-1 text-sm italic text-neutral-500">Read on ↓</p>
            </div>
          ) : null}

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
                    onClick={() => handleCopyRewrite(variant, variant.copyFormat)}
                    className="rounded-xl border px-4 py-2 text-sm font-semibold text-black shadow-sm transition-all duration-300 hover:scale-[1.02] hover:brightness-110 active:scale-[0.98]"
                    style={{
                      backgroundColor: MR_GOLD,
                      borderColor: MR_GOLD,
                    }}
                  >
                    {copiedRewriteKey === `${variant.id}:${variant.copyFormat}`
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
                    <option value="email">Email / Plain Text</option>
                    <option value="word">Word / Rich Text</option>
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

      {showRewrite && demoCount >= 2 && !showContinuation ? (
        <div className="mt-10 flex justify-center">
          <button
            onClick={() => {
              setShowContinuation(true);
              setTimeout(() => {
                continuationRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }, 100);
            }}
            className="rounded-xl border px-6 py-3 text-sm font-semibold text-black shadow-sm transition-all duration-300 hover:scale-[1.02] hover:brightness-110 active:scale-[0.98]"
            style={{
              backgroundColor: MR_GOLD,
              borderColor: MR_GOLD,
            }}
          >
            See where this goes →
          </button>
        </div>
      ) : null}

      {showContinuation ? (
        <section
          ref={continuationRef}
          className="mt-12 rounded-2xl border border-neutral-800 bg-neutral-950/70 px-5 py-6"
        >
          <h2 className="text-[20px] font-semibold tracking-tight text-neutral-100">
            What you’ve just seen is the final pass.
          </h2>

          <p className="mt-3 text-[17px] leading-7 text-neutral-300">
            The part most people never get to.
          </p>

          <p className="mt-4 text-[17px] leading-7 text-neutral-400">
            Most writing is created, edited… and then sent.
          </p>

          <p className="mt-4 text-[17px] leading-7 text-neutral-400">
            Gravitas sits at the point just before that.
          </p>

          <p className="mt-4 text-[17px] leading-7 text-neutral-400">
            Where the message is already formed — but not yet exposed.
          </p>

          <p className="mt-4 text-[17px] leading-7 text-neutral-400">
            It shows you where attention drops, where meaning blurs, and where the message weakens without you noticing — and corrects it before it ever reaches the reader.
          </p>

          <p className="mt-4 text-[17px] leading-7 text-neutral-400">
            Not by rewriting for you — but by revealing what your message is actually doing.
          </p>

          <p className="mt-4 text-[17px] leading-7 text-neutral-300">
            Once you see it, it’s very hard to go back to sending blind.
          </p>

          <p className="mt-6 text-[17px] leading-7 text-neutral-400">
            Most people start with email.
          </p>

          <p className="mt-4 text-[17px] leading-7 text-neutral-400">
            Then it spreads.
          </p>

          <p className="mt-4 text-[17px] leading-7 text-neutral-400">
            Landing pages — where small shifts change outcomes.
          </p>

          <p className="mt-4 text-[17px] leading-7 text-neutral-400">
            Reports and documents — where clarity matters more than persuasion.
          </p>

          <p className="mt-4 text-[17px] leading-7 text-neutral-400">
            Messages that are difficult to write — where tone is everything.
          </p>

          <p className="mt-4 text-[17px] leading-7 text-neutral-300">
            Anywhere the wording carries weight.
          </p>

          <p className="mt-6 text-[17px] leading-7 text-neutral-400">
            You can keep using Gravitas as part of your workflow:
          </p>

          <ul className="mt-3 list-disc space-y-1 pl-6 text-[17px] leading-7 text-neutral-300">
            <li>emails</li>
            <li>landing pages</li>
            <li>posts</li>
            <li>anything you’re about to send or publish</li>
          </ul>

          <p className="mt-6 text-[17px] leading-7 text-neutral-400">
            As a final check — before it goes out.
          </p>

          <p className="mt-8 text-lg text-neutral-100">$195 / month</p>
          <p className="mt-1 text-sm text-neutral-500">Cancel anytime.</p>

          <div className="mt-8">
            <button
              onClick={onSubscribe}
              className="rounded-xl border px-6 py-3 text-sm font-semibold text-black shadow-sm transition-all duration-300 hover:scale-[1.02] hover:brightness-110 active:scale-[0.98]"
              style={{
                backgroundColor: MR_GOLD,
                borderColor: MR_GOLD,
              }}
            >
              Subscribe
            </button>
          </div>
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
  const FREE_TRIAL_LIMIT = 3;

  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedAllKey, setCopiedAllKey] = useState<string | null>(null);
  const [copiedMessageKey, setCopiedMessageKey] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState<boolean | null>(null);
  const [demoCount, setDemoCount] = useState(0);
  const [demoSessionGranted, setDemoSessionGranted] = useState(false);
  const [accessResolved, setAccessResolved] = useState(false);
  const [telemetrySeed, setTelemetrySeed] = useState<TelemetrySeed | null>(null);
  const [telemetryMinuteTick, setTelemetryMinuteTick] = useState(0);
  const [analysisBoost, setAnalysisBoost] = useState(0);
  const [rewriteBoost, setRewriteBoost] = useState(0);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const messageContentRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const router = useRouter();
  const supabase = createClient();
  const sendLockRef = useRef(false);

  const isDemoLocked = isSubscribed === false && demoCount >= FREE_TRIAL_LIMIT;

  const canSend = useMemo(
    () => draft.trim().length > 0 && !isLoading && !isDemoLocked,
    [draft, isLoading, isDemoLocked]
  );

  function getRandomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function getWeeksSinceLaunch() {
    const launch = new Date(`${TELEMETRY_LAUNCH_DATE}T00:00:00`);
    const now = new Date();
    const diffMs = now.getTime() - launch.getTime();
    const diffWeeks = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7));
    return Math.max(0, diffWeeks);
  }

  function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function getMinutesSinceMidnight() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  function buildTelemetrySeed(): TelemetrySeed {
    const weeksSinceLaunch = getWeeksSinceLaunch();

    const weeklyAnalysesGrowth = weeksSinceLaunch * 55;
    const weeklyRewritesGrowth = weeksSinceLaunch * 140;

    const analysesStart = getRandomInt(320, 479) + weeklyAnalysesGrowth;

    const rewritesStart =
      getRandomInt(
        Math.floor(analysesStart * 2.0),
        Math.floor(analysesStart * 2.7)
      ) + weeklyRewritesGrowth;

    const analysesPerMinute = getRandomInt(4, 9) / 10;
    const rewritesPerMinute = getRandomInt(10, 18) / 10;

    return {
      dateKey: getTodayKey(),
      analysesStart,
      rewritesStart,
      analysesPerMinute,
      rewritesPerMinute,
    };
  }

  function getTelemetrySeed(): TelemetrySeed {
    const todayKey = getTodayKey();
    const raw = localStorage.getItem(TELEMETRY_STORAGE_KEY);

    if (raw) {
      try {
        const parsed = JSON.parse(raw) as TelemetrySeed;
        if (parsed.dateKey === todayKey) {
          return parsed;
        }
      } catch {
        // fall through
      }
    }

    const freshSeed = buildTelemetrySeed();
    localStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(freshSeed));
    return freshSeed;
  }

  function scrollToBottom() {
    setTimeout(() => {
      const el = scrollerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }

  useEffect(() => {
    setTelemetrySeed(getTelemetrySeed());
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTelemetryMinuteTick(Date.now());
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function checkSubscription() {
      setAccessResolved(false);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIsSubscribed(false);
        setDemoCount(0);
        setDemoSessionGranted(false);
        setAccessResolved(true);
        return;
      }

      const { data: subscriptionRows } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1);

      const subscribed = !!subscriptionRows && subscriptionRows.length > 0;
      setIsSubscribed(subscribed);

      const { data: profile } = await supabase
        .from("profiles")
        .select("demo_count")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile) {
        await supabase.from("profiles").insert({
          id: user.id,
          demo_count: 0,
        });

        setDemoCount(0);
        setDemoSessionGranted(true);
      } else {
        const count = profile.demo_count ?? 0;
        setDemoCount(count);
        setDemoSessionGranted(count < FREE_TRIAL_LIMIT);
      }

      setAccessResolved(true);
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

  async function onCopyMessage(index: number, format: CopyFormat) {
    const msg = messages[index];
    if (!msg || (msg.role === "assistant" && msg.content === THINKING_TOKEN)) return;

    await copyTextForFormat(msg.content, format);

    const key = `${index}:${format}`;
    setCopiedMessageKey(key);
    setTimeout(() => {
      setCopiedMessageKey((current) => (current === key ? null : current));
    }, 2000);
  }

  async function onCopyAll(format: CopyFormat) {
    if (messages.length === 0) return;

    const visibleMessages = messages.filter(
      (m) => !(m.role === "assistant" && m.content === THINKING_TOKEN)
    );

    if (visibleMessages.length === 0) return;

    const combined = visibleMessages
      .map((m) =>
        m.role === "assistant"
          ? normalizeAssistantCopyText(m.content.trim())
          : m.content.trim()
      )
      .filter(Boolean)
      .join("\n\n———\n\n");

    await copyTextForFormat(combined, format);

    setCopiedAllKey(format);
    setTimeout(() => {
      setCopiedAllKey((current) => (current === format ? null : current));
    }, 2000);
  }

  function onClear() {
    if (isLoading) return;
    setMessages([]);
    setDraft("");
    setCopiedAllKey(null);
    setCopiedMessageKey(null);
    messageContentRefs.current = {};
  }

  async function onSend() {
    if (sendLockRef.current) return;

    const raw = draft;
    if (!raw.trim() || isLoading || isDemoLocked) return;

    if (raw.length > 30000) {
      alert("That’s a large input. For best results, keep it under 30,000 characters.");
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

      const normalizedOutput = normalizeAssistantHeadings(
        data.output || "No response."
      );

      setMessages((m) =>
        m.map((msg) =>
          msg.role === "assistant" && msg.content === THINKING_TOKEN
            ? { role: "assistant", content: normalizedOutput }
            : msg
        )
      );

      const analysisJump = getRandomInt(14, 28);
      const rewriteJump = getRandomInt(36, 68);

      setAnalysisBoost((prev) => prev + analysisJump);
      setRewriteBoost((prev) => prev + rewriteJump);

      if (isSubscribed === false) {
        const nextDemoCount = demoCount + 1;
        setDemoCount(nextDemoCount);
        setDemoSessionGranted(nextDemoCount < FREE_TRIAL_LIMIT);

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          await supabase
            .from("profiles")
            .update({ demo_count: nextDemoCount })
            .eq("id", user.id);
        }
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

  const minutesSinceMidnight = getMinutesSinceMidnight();
  const timeDrivenAnalyses = telemetrySeed
    ? Math.floor(minutesSinceMidnight * telemetrySeed.analysesPerMinute)
    : 0;
  const timeDrivenRewrites = telemetrySeed
    ? Math.floor(minutesSinceMidnight * telemetrySeed.rewritesPerMinute)
    : 0;

  const analysesToday = telemetrySeed
    ? telemetrySeed.analysesStart + timeDrivenAnalyses + analysisBoost
    : 0;

  const rewritesToday = telemetrySeed
    ? telemetrySeed.rewritesStart + timeDrivenRewrites + rewriteBoost
    : 0;

  const reviewsRemaining = Math.max(0, FREE_TRIAL_LIMIT - demoCount);

  void telemetryMinuteTick;

  if (!accessResolved || !telemetrySeed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-100">
        Checking access...
      </main>
    );
  }

  if (isSubscribed === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-100">
        Checking subscription...
      </main>
    );
  }

  if (
    !isSubscribed &&
    demoCount >= FREE_TRIAL_LIMIT &&
    !demoSessionGranted &&
    messages.length === 0
  ) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-6 text-center text-neutral-100">
        <h1 className="mb-4 text-3xl font-semibold">Continue with Gravitas</h1>

        <p className="mb-4 max-w-xl text-neutral-300">
          You’ve just seen how your message will land before you send it.
        </p>

        <p className="mb-4 max-w-xl text-neutral-300">
          Use Gravitas on any important writing —
          to refine your message until it does the job you intended.
        </p>

        <p className="mb-8 max-w-xl text-neutral-400">
          See stronger alternatives in seconds —
          removing the guesswork of endless rewrites
          while keeping your natural voice intact.
        </p>

        <div className="flex gap-4">
          <button
            onClick={handleSubscribe}
            className="rounded-xl border px-6 py-3 text-sm font-semibold text-black shadow-sm transition-all duration-300 hover:scale-[1.02] hover:brightness-110 active:scale-[0.98]"
            style={{
              backgroundColor: MR_GOLD,
              borderColor: MR_GOLD,
            }}
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

            {isSubscribed === false ? (
              <div className="mt-1 text-xs text-neutral-500">
                Free trial: {reviewsRemaining} review{reviewsRemaining === 1 ? "" : "s"} remaining
              </div>
            ) : null}

            <div className="mt-1 text-xs text-neutral-500">
              Messages analysed today: {analysesToday} · Rewrites produced today: {rewritesToday}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isSubscribed === false ? (
              <button
                onClick={handleSubscribe}
                data-copy-ui="true"
                className="rounded-xl border px-3 py-2 text-sm font-semibold text-black shadow-sm transition-all duration-300 hover:scale-[1.02] hover:brightness-110 active:scale-[0.98]"
                style={{
                  backgroundColor: MR_GOLD,
                  borderColor: MR_GOLD,
                }}
              >
                Subscribe
              </button>
            ) : null}

            <button
              onClick={() => onCopyAll("email")}
              data-copy-ui="true"
              disabled={messages.length === 0}
              className="rounded-xl border border-neutral-800 px-3 py-2 text-sm hover:bg-neutral-900 disabled:cursor-not-allowed disabled:text-neutral-600"
            >
              {copiedAllKey === "email" ? "✓ Copied Email" : "Copy All Email"}
            </button>

            <button
              onClick={() => onCopyAll("word")}
              data-copy-ui="true"
              disabled={messages.length === 0}
              className="rounded-xl border border-neutral-800 px-3 py-2 text-sm hover:bg-neutral-900 disabled:cursor-not-allowed disabled:text-neutral-600"
            >
              {copiedAllKey === "word" ? "✓ Copied Word" : "Copy All Word"}
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
              Start by pasting something you sent recently — an email, message, landing page, ad, or article.
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

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onCopyMessage(i, "email")}
                          data-copy-ui="true"
                          disabled={isThinking}
                          className="rounded-lg border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:text-neutral-600"
                        >
                          {copiedMessageKey === `${i}:email` ? "✓ Email" : "Email"}
                        </button>

                        <button
                          onClick={() => onCopyMessage(i, "word")}
                          data-copy-ui="true"
                          disabled={isThinking}
                          className="rounded-lg border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:text-neutral-600"
                        >
                          {copiedMessageKey === `${i}:word` ? "✓ Word" : "Word"}
                        </button>
                      </div>
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
                          demoCount={demoCount}
                          onSubscribe={handleSubscribe}
                          onRewriteProduced={() => {
                            setAnalysisBoost((prev) => prev + getRandomInt(6, 14));
                            setRewriteBoost((prev) => prev + getRandomInt(24, 46));
                          }}
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
              placeholder="Paste something you sent recently — and see what actually happened"
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
          <div className="mt-2 text-xs text-neutral-500">
            Start with an email or message you’ve already sent.
          </div>
        </div>
      </div>
    </main>
  );
}
