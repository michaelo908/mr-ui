"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  CADENCE_OPTIONS,
  cadenceInstruction,
  type CadenceMode,
} from "@/lib/cadence";
import {
  getActiveSourceKey,
  getAnalysisRunKey,
  hasReadySource,
  hasCompletedAnalysis,
  isValidPublicHttpUrl,
} from "@/lib/graviton-runs";
import {
  buildRenderedUrlAnalysisInput,
  MAX_URL_VIEWPORTS,
  type SourceIdentity,
  type SourceImage,
  type UrlSource,
} from "@/lib/sources";
import {
  formatJumpInRemaining,
  getJumpInRemainingMs,
  isJumpInExpired,
  isJumpInResetEligible,
  JUMP_IN_DAY_PASS_URL,
  JUMP_IN_DURATION_MS,
  JUMP_IN_MAX_PASTED_WORDS,
  JUMP_IN_MAX_URL_VIEWPORTS,
  JUMP_IN_STORAGE_KEY,
  type JumpInSessionState,
} from "@/lib/jump-in";
import {
  shouldShowAnalysisEasterEgg,
  type AnalysisStatus,
} from "@/lib/analysis-personality";
import { createAnalysisRunCoordinator } from "@/lib/analysis-run-coordinator";
import {
  getViewportImageByNumber,
  parseNarrativePerformance,
  type NarrativePerformanceLightboxContext,
  type NarrativePerformanceViewportLaunch,
} from "@/lib/narrative-performance";
import ImageLightbox from "@/components/ImageLightbox";
import NarrativePerformancePanel from "@/components/NarrativePerformancePanel";
import { calculateEditorSummaryScrollTop } from "@/lib/report-scroll";
import {
  parseTextEvidenceBlocks,
  type TextEvidenceLaunch,
} from "@/lib/text-evidence";
import { emitSignal, initializeSignalIdentity, signalHeaders, toSignalIdentifier } from "@/lib/signals/client";
import type { SignalName } from "@/lib/signals/registry";

type Msg = {
  role: "user" | "assistant";
  content: string;
  runId?: string;
  analysisStatus?: AnalysisStatus;
  sourceContent?: string;
  imageData?: string[];
  sourceImages?: SourceImage[];
  sourceIdentity?: SourceIdentity;
};
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

function JumpInWelcome() {
  return (
    <div
      className="flex min-h-[420px] items-center justify-center px-4 py-10 text-center sm:min-h-[500px] sm:px-10"
      aria-label="How to begin your Gravitas session"
    >
      <div className="w-full max-w-xl">
        <p className="jump-in-reveal jump-in-reveal-1 text-xs font-semibold uppercase tracking-[0.28em] text-[#C6A75A]">
          Your message. Seen from the other side.
        </p>

        <h2 className="jump-in-reveal jump-in-reveal-2 mt-5 text-3xl font-semibold tracking-tight text-neutral-100 sm:text-4xl">
          Paste something that matters.
        </h2>

        <div className="jump-in-reveal jump-in-reveal-3 mt-7 space-y-2 text-lg leading-8 text-neutral-300">
          <p>Something you&apos;re about to send.</p>
          <p>Or something you just sent out.</p>
        </div>

        <p className="jump-in-reveal jump-in-reveal-4 mx-auto mt-7 max-w-lg text-sm leading-7 text-neutral-500 sm:text-base">
          An email, proposal, landing page, report, homepage, LinkedIn post,
          newsletter or sales page.
        </p>

        <div className="jump-in-reveal jump-in-reveal-5 mx-auto mt-8 max-w-lg border-y border-neutral-800 py-7">
          <p className="text-base leading-7 text-neutral-400">
            Gravitas won&apos;t tell you what you wrote.
          </p>
          <p className="mt-2 text-xl font-medium leading-8 text-neutral-100">
            It will show you what your reader experiences.
          </p>
        </div>

        <p className="jump-in-reveal jump-in-reveal-6 mt-8 text-base font-semibold text-neutral-100">
          Paste it below. Then press Gravitate.
        </p>
        <p className="jump-in-reveal jump-in-reveal-6 mt-2 text-xs text-neutral-600">
          Your 20-minute session starts with your first analysis.
        </p>
      </div>

      <style jsx>{`
        .jump-in-reveal {
          opacity: 0;
          transform: translateY(10px);
          animation: jump-in-reveal 700ms cubic-bezier(0.22, 1, 0.36, 1)
            forwards;
        }

        .jump-in-reveal-1 {
          animation-delay: 120ms;
        }

        .jump-in-reveal-2 {
          animation-delay: 520ms;
        }

        .jump-in-reveal-3 {
          animation-delay: 1050ms;
        }

        .jump-in-reveal-4 {
          animation-delay: 1650ms;
        }

        .jump-in-reveal-5 {
          animation-delay: 2250ms;
        }

        .jump-in-reveal-6 {
          animation-delay: 2950ms;
        }

        @keyframes jump-in-reveal {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .jump-in-reveal {
            opacity: 1;
            transform: none;
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

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

  if (parsed.sections.performance?.trim()) {
    parts.push("Narrative Performance");
    parts.push(parsed.sections.performance.trim());
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
): "summary" | "performance" | "depth" | "rewrite" | "debrief" | null {
  const t = normalizeSectionLabel(line);

  if (
    t === "executive summary" ||
    t === "editors summary" ||
    t === "editor summary"
  ) {
    return "summary";
  }

  if (t === "narrative performance") {
    return "performance";
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

  type Kind = "summary" | "performance" | "depth" | "rewrite" | "debrief";
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
    Boolean(sections.performance) ||
    Boolean(sections.depth) ||
    Boolean(sections.rewrite) ||
    Boolean(sections.debrief);

  return { hasStructured, sections, order };
}

function renderMR(content: string) {
  const nodes = parseContentNodes(content);

  function renderInline(text: string) {
  function renderTextWithLinks(value: string, baseKey: string) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = value.split(urlRegex).filter(Boolean);

    return parts.map((part, partIdx) => {
      if (/^https?:\/\//.test(part)) {
        const href = part.replace(/[.,!?;:]$/, "");
        const trailing = part.slice(href.length);

        return (
          <span key={`${baseKey}-link-${partIdx}`}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 text-amber-300 hover:text-amber-200"
            >
              {href}
            </a>
            {trailing}
          </span>
        );
      }

      return <span key={`${baseKey}-text-${partIdx}`}>{part}</span>;
    });
  }

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

    return <span key={idx}>{renderTextWithLinks(token, `token-${idx}`)}</span>;
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
  sourceImageData,
  sourceImages,
  sourceIdentity,
  cadence,
  apiEndpoint,
  interactionLocked,
  onSessionExpired,
  onRewriteProduced,
  onInteractionSignal,
}: {
  content: string;
  sourceRaw: string;
  sourceImageData: string[];
  sourceImages: SourceImage[];
  sourceIdentity?: SourceIdentity;
  cadence: CadenceMode;
  apiEndpoint: string;
  interactionLocked: boolean;
  onSessionExpired?: () => void;
  onRewriteProduced?: () => void;
  onInteractionSignal?: (name: SignalName, properties?: Record<string, unknown>) => void;
}) {
  const { hasStructured, sections } = useMemo(() => parseStructuredMR(content), [content]);
  const rewriteSectionRef = useRef<HTMLElement | null>(null);
  const newestRewriteRef = useRef<HTMLDivElement | null>(null);
  const [showRewrite, setShowRewrite] = useState(false);
  const [showRewriteButton, setShowRewriteButton] = useState(false);
  const [rewriteState, setRewriteState] = useState<"idle" | "working">("idle");
  const [copiedRewriteKey, setCopiedRewriteKey] = useState<string | null>(null);
  const [rewrites, setRewrites] = useState<RewriteVariant[]>([]);
  const [isGeneratingAlternate, setIsGeneratingAlternate] = useState(false);
  const [activeLightboxIndex, setActiveLightboxIndex] = useState<number | null>(
    null
  );
  const [lightboxContext, setLightboxContext] =
    useState<NarrativePerformanceLightboxContext | null>(null);
  const [isDepthOpen, setIsDepthOpen] = useState(false);
  const [pendingTextEvidence, setPendingTextEvidence] =
    useState<TextEvidenceLaunch | null>(null);
  const [highlightedTextEvidence, setHighlightedTextEvidence] =
    useState<TextEvidenceLaunch | null>(null);
  const textEvidenceRefs = useRef(new Map<number, HTMLDivElement>());
  const textEvidenceHighlightTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const summary = sections.summary?.trim();
  const performance = useMemo(
    () =>
      sections.performance
        ? parseNarrativePerformance(sections.performance)
        : null,
    [sections.performance]
  );
  const depth = sections.depth?.trim();
  const textEvidenceBlocks = useMemo(
    () => (depth ? parseTextEvidenceBlocks(depth) : []),
    [depth]
  );
  const rewrite = sections.rewrite?.trim();
  const debrief = sections.debrief?.trim();
  const displayImages = useMemo<SourceImage[]>(
    () =>
      sourceImages.length > 0
        ? sourceImages
        : sourceImageData.map((dataUrl, index) => ({
            id: `legacy-image-${index}`,
            type: "image" as const,
            title: `Image ${index + 1}`,
            dataUrl,
            order: index,
          })),
    [sourceImageData, sourceImages]
  );
  const orderedViewportImages = useMemo(
    () =>
      displayImages
        .filter((image) => image.role === "viewport")
        .sort((left, right) => left.order - right.order),
    [displayImages]
  );
  const lightboxImages =
    orderedViewportImages.length > 0 ? orderedViewportImages : displayImages;
  const openImage = useCallback(
    (image: SourceImage) => {
      const index = lightboxImages.findIndex(
        (candidate) => candidate.id === image.id
      );
      if (index >= 0) {
        setLightboxContext(null);
        setActiveLightboxIndex(index);
      }
    },
    [lightboxImages]
  );
  const openViewport = useCallback(
    (viewportNumber: number) => {
      const image = getViewportImageByNumber(
        orderedViewportImages,
        viewportNumber
      );
      if (!image) return;
      const index = orderedViewportImages.findIndex(
        (candidate) => candidate.id === image.id
      );
      if (index >= 0) {
        setLightboxContext(null);
        setActiveLightboxIndex(index);
      }
    },
    [orderedViewportImages]
  );
  const openRecommendationViewport = useCallback(
    (launch: NarrativePerformanceViewportLaunch) => {
      const image = getViewportImageByNumber(
        orderedViewportImages,
        launch.startingViewport
      );
      if (!image) return;
      const index = orderedViewportImages.findIndex(
        (candidate) => candidate.id === image.id
      );
      if (index >= 0) {
        onInteractionSignal?.("engagement.evidence_inspected", {
          evidence_type: "viewport",
          evidence_number: launch.startingViewport,
        });
        setLightboxContext(launch.context);
        setActiveLightboxIndex(index);
      }
    },
    [onInteractionSignal, orderedViewportImages]
  );
  const closeLightbox = useCallback(() => {
    setActiveLightboxIndex(null);
    setLightboxContext(null);
  }, []);
  const changeLightboxImage = useCallback(
    (index: number) => setActiveLightboxIndex(index),
    []
  );
  const openTextEvidence = useCallback((launch: TextEvidenceLaunch) => {
    onInteractionSignal?.("engagement.evidence_inspected", {
      evidence_type: "text",
      evidence_number: launch.evidenceNumber,
    });
    setIsDepthOpen(true);
    setPendingTextEvidence(launch);
  }, [onInteractionSignal]);

  useEffect(() => {
    if (!isDepthOpen || !pendingTextEvidence) return;

    const frame = window.requestAnimationFrame(() => {
      const target = textEvidenceRefs.current.get(
        pendingTextEvidence.evidenceNumber
      );
      if (!target) {
        setPendingTextEvidence(null);
        return;
      }

      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      target.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
      });
      target.focus({ preventScroll: true });
      setHighlightedTextEvidence(pendingTextEvidence);
      setPendingTextEvidence(null);

      if (textEvidenceHighlightTimeoutRef.current) {
        clearTimeout(textEvidenceHighlightTimeoutRef.current);
      }
      textEvidenceHighlightTimeoutRef.current = setTimeout(() => {
        setHighlightedTextEvidence(null);
        textEvidenceHighlightTimeoutRef.current = null;
      }, 1800);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isDepthOpen, pendingTextEvidence]);

  useEffect(
    () => () => {
      if (textEvidenceHighlightTimeoutRef.current) {
        clearTimeout(textEvidenceHighlightTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    setShowRewrite(false);
    setShowRewriteButton(false);
    setRewriteState("idle");
    setCopiedRewriteKey(null);
    setIsGeneratingAlternate(false);
    setActiveLightboxIndex(null);
    setLightboxContext(null);
    setIsDepthOpen(false);
    setPendingTextEvidence(null);
    setHighlightedTextEvidence(null);
    textEvidenceRefs.current.clear();

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
    if (interactionLocked && rewrite) {
      setShowRewrite(true);
    }
  }, [interactionLocked, rewrite]);

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
    if (interactionLocked) return;
    onInteractionSignal?.("workflow.rewrite_revealed");
    setRewriteState("working");
    setTimeout(() => {
      revealRewrite();
    }, 450);
  };

  async function handleCopyRewrite(variant: RewriteVariant, format: CopyFormat) {
    await copyTextForFormat(variant.content, format);
    onInteractionSignal?.("workflow.rewrite_copied", { format });
    const copyKey = `${variant.id}:${format}`;
    setCopiedRewriteKey(copyKey);
    setTimeout(() => {
      setCopiedRewriteKey((current) => (current === copyKey ? null : current));
    }, 2000);
  }

  async function handleRewriteAgain() {
    if (interactionLocked || rewrites.length >= 3 || isGeneratingAlternate) return;

    const parsed = parseCommand(sourceRaw);
    if (!parsed.content.trim() && sourceImageData.length === 0) return;

    setIsGeneratingAlternate(true);

    const alternateInstruction = `Provide only a fresh alternate rewrite of this same original text. Do not include summary, diagnosis, notes, headings, labels, or debrief. Return only the rewritten copy.

${cadenceInstruction(cadence)}`;
    const sourceText =
      parsed.content.trim() ||
      `Create a fresh alternate rewrite based on the attached image${
        sourceImageData.length === 1 ? "" : "s"
      }.`;

    const payload =
      parsed.mode === "mr_heresy"
        ? {
            mode: "mr_heresy",
            requestKind: "alternate-rewrite",
            input: " ",
            context: `${alternateInstruction}\n\nApply Multirrupt Mode to the following source:\n\n${sourceText}`,
            constraints: {},
            imageData: sourceImageData,
            cadence,
            sourceMode: sourceIdentity?.type === "url" ? "rendered-url" : undefined,
          }
        : {
            mode: "general",
            requestKind: "alternate-rewrite",
            input: sourceText,
            context: alternateInstruction,
            constraints: {},
            imageData: sourceImageData,
            cadence,
            sourceMode: sourceIdentity?.type === "url" ? "rendered-url" : undefined,
          };

    try {
      const alternateAnalysisId = crypto.randomUUID();
      const alternateSurface = apiEndpoint.includes("jump-in") ? "jump-in" : "paid";
      const res = await fetch(apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...signalHeaders(alternateSurface),
          "X-Gravitas-Analysis-Id": alternateAnalysisId,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.status === 403 && data.expired) {
        onSessionExpired?.();
        return;
      }
      const rawOutput = (data.output || "").trim();
      if (!rawOutput) return;

      const parsedAlt = parseStructuredMR(rawOutput);
      const alternateRewrite =
        parsedAlt.sections.rewrite?.trim() || rawOutput;

      setRewrites((prev) => {
        if (prev.length >= 3) return prev;
        return [...prev, makeRewriteVariant(alternateRewrite, prev.length)];
      });

      onInteractionSignal?.("workflow.rewrite_created");
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
          {sourceIdentity?.type === "url" ? (
            <div className="mb-5 rounded-xl border border-neutral-800 bg-neutral-950/60 px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                Source
              </div>
              <div className="mt-1 text-sm font-semibold text-neutral-200">
                {sourceIdentity.title}
              </div>
              {sourceIdentity.originalLocation ? (
                <a
                  href={sourceIdentity.originalLocation}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block truncate text-xs text-[#C6A75A] hover:underline"
                >
                  {sourceIdentity.originalLocation}
                </a>
              ) : null}
            </div>
          ) : null}
          {displayImages.length > 0 ? (
            <div className="mb-5">
              <SourceImageStrip
                images={displayImages}
                compact
                onOpenImage={openImage}
              />
            </div>
          ) : null}

          <h2
            data-editor-summary-anchor="true"
            className="text-[20px] font-semibold tracking-tight text-neutral-100"
          >
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
                disabled={interactionLocked}
                data-copy-ui="true"
                className={classNames(
                  "rounded-xl border px-6 py-3 text-sm font-semibold tracking-wide text-black shadow-sm transition-all duration-300 hover:scale-[1.02] hover:brightness-110 active:scale-[0.98]",
                  rewriteState === "working" && "animate-pulse",
                  interactionLocked && "cursor-not-allowed opacity-50"
                )}
                style={{
                  backgroundColor: MR_GOLD,
                  borderColor: MR_GOLD,
                }}
              >
                {interactionLocked
                  ? "Session ended"
                  : rewriteState === "working"
                    ? "Rewriting…"
                    : "Rewrite"}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {performance ? (
        <NarrativePerformancePanel
          performance={performance}
          images={orderedViewportImages}
          onOpenViewport={openViewport}
          onOpenRecommendation={openRecommendationViewport}
          textEvidenceBlocks={
            displayImages.length === 0 ? textEvidenceBlocks : []
          }
          onOpenTextEvidence={
            displayImages.length === 0 ? openTextEvidence : undefined
          }
        />
      ) : null}

      {depth ? (
        <details
          open={isDepthOpen}
          onToggle={(event) => {
            const open = event.currentTarget.open;
            setIsDepthOpen(open);
            onInteractionSignal?.("engagement.depth_toggled", { open });
          }}
          className="rounded-2xl border border-[#C6A75A]/30 bg-neutral-900/30"
        >
          <summary
            aria-expanded={isDepthOpen}
            className="cursor-pointer list-none px-4 py-4 font-semibold marker:hidden hover:bg-[#C6A75A]/[0.04]"
          >
            <div className="flex items-center justify-between gap-4">
              <span className="text-[17px]" style={{ color: MR_GOLD }}>
                Editor’s Notes in Depth
              </span>
              <span
                className="inline-flex items-center gap-1.5 text-sm uppercase tracking-[0.12em]"
                style={{ color: MR_GOLD }}
              >
                {isDepthOpen ? "Click to close" : "Click to expand"}{" "}
                <span aria-hidden="true">{isDepthOpen ? "▴" : "▾"}</span>
              </span>
            </div>
          </summary>
          <div className="border-t border-neutral-800 px-4 py-4">
            {textEvidenceBlocks.length > 0 && displayImages.length === 0 ? (
              <div className="space-y-3">
                {textEvidenceBlocks.map((block) => {
                  const highlight =
                    highlightedTextEvidence?.evidenceNumber === block.number
                      ? highlightedTextEvidence
                      : null;
                  return (
                    <div
                      key={block.id}
                      id={block.id}
                      ref={(element) => {
                        if (element) {
                          textEvidenceRefs.current.set(block.number, element);
                        } else {
                          textEvidenceRefs.current.delete(block.number);
                        }
                      }}
                      tabIndex={-1}
                      aria-label={`Evidence ${block.number}`}
                      className={classNames(
                        "scroll-mt-24 rounded-xl border px-3 py-2 outline-none transition-[border-color,background-color,box-shadow] duration-700",
                        highlight
                          ? "gravitas-text-evidence-highlight"
                          : "border-transparent bg-transparent"
                      )}
                      style={
                        highlight
                          ? ({
                              borderColor: highlight.color,
                              backgroundColor: `color-mix(in srgb, ${highlight.color} 9%, transparent)`,
                              "--evidence-color": highlight.color,
                            } as React.CSSProperties)
                          : undefined
                      }
                    >
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                        Evidence {block.number}
                      </div>
                      {renderMR(block.content)}
                    </div>
                  );
                })}
                <style jsx>{`
                  .gravitas-text-evidence-highlight {
                    animation: gravitas-evidence-emphasis 1.35s ease-out 1;
                  }

                  @keyframes gravitas-evidence-emphasis {
                    0% {
                      box-shadow: 0 0 0 0
                        color-mix(
                          in srgb,
                          var(--evidence-color) 32%,
                          transparent
                        );
                    }
                    45% {
                      box-shadow: 0 0 0 4px
                        color-mix(
                          in srgb,
                          var(--evidence-color) 14%,
                          transparent
                        );
                    }
                    100% {
                      box-shadow: 0 0 0 0 transparent;
                    }
                  }

                  @media (prefers-reduced-motion: reduce) {
                    .gravitas-text-evidence-highlight {
                      animation: none;
                    }
                  }
                `}</style>
              </div>
            ) : (
              renderMR(depth)
            )}
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

          {rewrites.length < 3 && !interactionLocked ? (
  <div className="mt-8 flex justify-start" data-copy-ui="true">
    {isGeneratingAlternate ? (
      <button
        key="rewrite-again-working"
        type="button"
        disabled
        className="inline-flex min-w-[150px] items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold opacity-70"
        style={{
          color: MR_GOLD,
          borderColor: `${MR_GOLD}99`,
          backgroundColor: "transparent",
        }}
      >
        Working…
      </button>
    ) : (
      <button
        key="rewrite-again-idle"
        type="button"
        onClick={handleRewriteAgain}
        className="inline-flex min-w-[150px] items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition"
        style={{
          color: MR_GOLD,
          borderColor: `${MR_GOLD}99`,
          backgroundColor: "transparent",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = `${MR_GOLD}1A`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        Rewrite Again
      </button>
    )}
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

      <ImageLightbox
        images={lightboxImages}
        activeIndex={activeLightboxIndex}
        context={lightboxContext}
        onChange={changeLightboxImage}
        onClose={closeLightbox}
      />
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

function SourceImageStrip({
  images,
  compact = false,
  onOpenImage,
}: {
  images: SourceImage[];
  compact?: boolean;
  onOpenImage?: (image: SourceImage) => void;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const orderedImages = useMemo(
    () =>
      images.some((image) => image.role === "viewport")
        ? [...images].sort((left, right) => left.order - right.order)
        : images,
    [images]
  );
  const closeLightbox = useCallback(() => setActiveIndex(null), []);
  const changeLightboxImage = useCallback(
    (index: number) => setActiveIndex(index),
    []
  );

  return (
    <>
      <div className={compact ? "flex flex-wrap gap-3" : "flex gap-2 overflow-x-auto pb-1"}>
        {orderedImages.map((image, index) => (
          <figure key={image.id} className={compact ? "w-24" : "shrink-0"}>
            <button
              type="button"
              onClick={() => {
                if (onOpenImage) onOpenImage(image);
                else setActiveIndex(index);
              }}
              className="block rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C6A75A]"
              aria-label={`Open ${
                image.role === "viewport"
                  ? `viewport ${index + 1}`
                  : `image ${index + 1}`
              }`}
            >
              <img
                src={image.dataUrl}
                alt={image.altText || image.title || `Image ${index + 1}`}
                title={image.altText}
                className={
                  compact
                    ? "h-20 w-24 rounded-lg border border-neutral-700 object-cover transition hover:border-[#C6A75A]"
                    : "h-24 w-24 rounded-xl border border-neutral-800 object-cover transition hover:border-[#C6A75A]"
                }
              />
            </button>
            <figcaption
              className={
                compact
                  ? "mt-1 text-center text-[10px] uppercase tracking-wider text-neutral-500"
                  : "mt-1 max-w-24 truncate text-center text-[11px] text-neutral-500"
              }
              title={image.altText}
            >
              {image.role === "viewport"
                ? `Viewport ${index + 1} of ${orderedImages.length}`
                : orderedImages.length === 1
                  ? compact
                    ? "Image analysed"
                    : "Image 1"
                  : compact
                    ? `Image ${index + 1} of ${orderedImages.length}`
                    : `Image ${index + 1}`}
            </figcaption>
          </figure>
        ))}
      </div>
      {!onOpenImage ? (
        <ImageLightbox
          images={orderedImages}
          activeIndex={activeIndex}
          onChange={changeLightboxImage}
          onClose={closeLightbox}
        />
      ) : null}
    </>
  );
}
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result as string);
    };

    reader.onerror = reject;

    reader.readAsDataURL(file);
  });
}
async function compressImage(file: File): Promise<File> {
  const img = document.createElement("img");
  const url = URL.createObjectURL(file);

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });

  const maxWidth = 1200;
  const scale = Math.min(1, maxWidth / img.width);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context");

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  URL.revokeObjectURL(url);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Compression failed"))),
      "image/jpeg",
      0.72
    );
  });

  return new File(
    [blob],
    file.name.replace(/\.[^.]+$/, ".jpg"),
    { type: "image/jpeg" }
  );
}
export default function GravitasApp({
  experience = "paid",
}: {
  experience?: "paid" | "jump-in";
}) {
  const isJumpIn = experience === "jump-in";

  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [inputMode, setInputMode] = useState<"text" | "url" | "images">("text");
  const [urlDraft, setUrlDraft] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [importedUrl, setImportedUrl] = useState<{
    requestedUrl: string;
    source: UrlSource;
  } | null>(null);
  const [cadence, setCadence] = useState<CadenceMode>("dynamic");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [selectedGraviton, setSelectedGraviton] =
  useState("Full Analysis");
  const [completedAnalysisRuns, setCompletedAnalysisRuns] = useState<Set<string>>(
    () => new Set()
  );

const gravitonGroups = [
  {
    label: "Default",
    options: [
      "Full Analysis",
    ],
  },
  {
    label: "Customer Experience",
    options: [
      "What does the visitor experience first?",
      "Describe the customer journey.",
      "What conclusions will readers draw?",
    ],
  },
  {
    label: "Attention",
    options: [
      "Where does attention drift?",
      "What weakens engagement?",
      "What would readers remember?",
    ],
  },
  {
    label: "Trust",
    options: [
      "What weakens trust?",
      "What builds credibility?",
      "What creates resistance?",
    ],
  },
  {
    label: "Conversion",
    options: [
      "Why isn't this converting?",
      "What prevents action?",
      "What creates hesitation?",
    ],
  },
  {
    label: "Email",
    options: [
      "Should this be a multi-email campaign?",
      "Is this asking for too much?",
      "What is the primary message?",
    ],
  },
  {
    label: "Summary",
    options: [
      "Summarise the sales approach.",
      "Summarise the positioning.",
      "Summarise the key messages.",
    ],
  },
  {
    label: "Image Set",
    options: [
      "Describe this/these images.",
      "What recurring themes are present?",
      "What emotional tone emerges?",
      "What common motifs appear?",
      "What narrative is implied?",
      "Is there a sense of progression?",
      "How do these images relate to one another?",
      "What is the likely intent behind this collection?",
    ],
  },
  {
    label: "Visual Fit",
    options: [
      "Which images best fit the narrative and emotional context?",
    ],
  },
];

  const [isLoading, setIsLoading] = useState(false);
  const [isCapturingUrl, setIsCapturingUrl] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<string | null>(null);
  const [copiedAllKey, setCopiedAllKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copiedMessageKey, setCopiedMessageKey] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState<boolean | null>(null);
  const [isBookTrial, setIsBookTrial] = useState(false);
  const [bookTrialDaysRemaining, setBookTrialDaysRemaining] = useState<number | null>(null);
  const [accessResolved, setAccessResolved] = useState(false);
  const [telemetrySeed, setTelemetrySeed] = useState<TelemetrySeed | null>(null);
  const [telemetryMinuteTick, setTelemetryMinuteTick] = useState(0);
  const [analysisBoost, setAnalysisBoost] = useState(0);
  const [rewriteBoost, setRewriteBoost] = useState(0);
  const [jumpInSession, setJumpInSession] =
    useState<JumpInSessionState | null>(null);
  const [jumpInNow, setJumpInNow] = useState(Date.now());
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const messageContentRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const router = useRouter();
  const supabase = createClient();
  const sendLockRef = useRef(false);
  const runCoordinatorRef = useRef(createAnalysisRunCoordinator());

  const jumpInExpired = isJumpInExpired(
    jumpInSession?.startedAt ?? null,
    jumpInNow
  );
  const jumpInRemainingMs = getJumpInRemainingMs(
    jumpInSession?.startedAt ?? null,
    jumpInNow
  );
  const isDemoLocked = isJumpIn && jumpInExpired;
  const apiEndpoint = isJumpIn ? "/api/jump-in/mr" : "/api/mr";
  const signalSurface = isJumpIn ? "jump-in" as const : "paid" as const;

  useEffect(() => {
    const key = `gravitasSignalSessionStartedV1:${signalSurface}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {}
    emitSignal("discovery.session_started", signalSurface, {
      entry_path: window.location.pathname,
    });
  }, [signalSurface]);

  const activeSourceKey = useMemo(() => {
    if (inputMode === "url") {
      return getActiveSourceKey({ type: "url", url: urlDraft });
    }

    if (inputMode === "images") {
      return getActiveSourceKey({
        type: "images",
        images: imageFiles.map((file) => ({
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
        })),
      });
    }

    return getActiveSourceKey({ type: "text", text: draft });
  }, [draft, imageFiles, inputMode, urlDraft]);

  const isRepeatedGraviton = hasCompletedAnalysis(
    completedAnalysisRuns,
    activeSourceKey,
    selectedGraviton
  );
  const hasValidActiveSource = hasReadySource(
    inputMode === "text"
      ? { type: "text", text: draft }
      : inputMode === "url"
        ? { type: "url", url: urlDraft }
        : {
            type: "images",
            images: imageFiles.map((file) => ({
              name: file.name,
              size: file.size,
              lastModified: file.lastModified,
            })),
          }
  );

  const canSend = useMemo(
  () =>
    hasValidActiveSource &&
    !isLoading &&
    !isDemoLocked &&
    !isRepeatedGraviton,
  [
    hasValidActiveSource,
    isLoading,
    isDemoLocked,
    isRepeatedGraviton,
  ]
);

const imagePreviewUrls = useMemo(() => {
  return imageFiles.map((file) => URL.createObjectURL(file));
}, [imageFiles]);

const selectedSourceImages = useMemo<SourceImage[]>(() => {
  if (inputMode === "url") return importedUrl?.source.images ?? [];
  return imagePreviewUrls.map((dataUrl, index) => ({
    id: `uploaded-image-${index}-${imageFiles[index]?.name ?? "image"}`,
    type: "image",
    title: imageFiles[index]?.name || `Image ${index + 1}`,
    dataUrl,
    altText: imageFiles[index]?.name,
    order: index,
  }));
}, [imageFiles, imagePreviewUrls, importedUrl, inputMode]);

useEffect(() => {
  return () => {
    imagePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
  };
}, [imagePreviewUrls]);

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

    const analysesStart = getRandomInt(320, 479) + weeklyAnalysesGrowth;

    const rewritesStart =
      getRandomInt(
        Math.floor(analysesStart * 1.08),
        Math.floor(analysesStart * 1.18)
      );

    const analysesPerMinute = getRandomInt(4, 9) / 10;
    const rewritesPerMinute =
      analysesPerMinute * (getRandomInt(108, 118) / 100);

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

  function scrollToLatestEditorSummary() {
    const positionSummary = (behavior: ScrollBehavior) => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const summaries = scroller.querySelectorAll<HTMLElement>(
        '[data-editor-summary-anchor="true"]'
      );
      const target = summaries[summaries.length - 1];
      if (!target) return;

      const scrollerRect = scroller.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const pageTop = window.scrollY + scrollerRect.top;
      const top = calculateEditorSummaryScrollTop({
        currentScrollTop: scroller.scrollTop,
        scrollerTop: 0,
        targetTop: targetRect.top - scrollerRect.top,
        viewportHeight: window.innerHeight,
      });
      window.scrollTo({ top: pageTop, behavior });
      scroller.scrollTo({ top, behavior });
    };

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => positionSummary("smooth"));
    });

    window.setTimeout(() => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const summaries = scroller.querySelectorAll<HTMLElement>(
        '[data-editor-summary-anchor="true"]'
      );
      const target = summaries[summaries.length - 1];
      if (!target) return;
      const scrollerRect = scroller.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const pageTop = window.scrollY + scrollerRect.top;
      const expectedTop = calculateEditorSummaryScrollTop({
        currentScrollTop: scroller.scrollTop,
        scrollerTop: 0,
        targetTop: targetRect.top - scrollerRect.top,
        viewportHeight: window.innerHeight,
      });
      if (Math.abs(scrollerRect.top) > 12) {
        window.scrollTo({ top: pageTop, behavior: "auto" });
      }
      if (Math.abs(expectedTop - scroller.scrollTop) > 12) {
        scroller.scrollTo({ top: expectedTop, behavior: "auto" });
      }
    }, 900);
  }

  useEffect(() => {
    setTelemetrySeed(getTelemetrySeed());
  }, []);

  useEffect(() => {
    if (!isJumpIn) return;

    let session: JumpInSessionState | null = null;
    const saved = window.localStorage.getItem(JUMP_IN_STORAGE_KEY);

    if (saved) {
      try {
        const parsed = JSON.parse(saved) as JumpInSessionState;
        if (
          typeof parsed.sessionId === "string" &&
          (parsed.startedAt === null || typeof parsed.startedAt === "number")
        ) {
          session = isJumpInResetEligible(parsed.startedAt)
            ? { sessionId: crypto.randomUUID(), startedAt: null }
            : parsed;
        }
      } catch {
        // Replace malformed local state below.
      }
    }

    session ??= {
      sessionId: crypto.randomUUID(),
      startedAt: null,
    };

    if (!session.sessionStartedEventSent) {
      void fetch("/api/jump-in/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "session_started",
          sessionId: session.sessionId,
        }),
      });
      session.sessionStartedEventSent = true;
    }

    window.localStorage.setItem(JUMP_IN_STORAGE_KEY, JSON.stringify(session));
    setJumpInSession(session);
    setJumpInNow(Date.now());
  }, [isJumpIn]);

  useEffect(() => {
    if (!isJumpIn || jumpInSession?.startedAt === null) return;

    const interval = window.setInterval(() => {
      setJumpInNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isJumpIn, jumpInSession?.startedAt]);

  useEffect(() => {
    if (
      !isJumpIn ||
      !jumpInSession ||
      !isJumpInResetEligible(jumpInSession.startedAt, jumpInNow)
    ) {
      return;
    }

    const renewedSession: JumpInSessionState = {
      sessionId: crypto.randomUUID(),
      startedAt: null,
    };
    window.localStorage.setItem(
      JUMP_IN_STORAGE_KEY,
      JSON.stringify(renewedSession)
    );
    setJumpInSession(renewedSession);
    setJumpInNow(Date.now());
  }, [isJumpIn, jumpInNow, jumpInSession]);

  useEffect(() => {
    if (!isJumpIn || !jumpInExpired || !jumpInSession) return;
    if (isJumpInResetEligible(jumpInSession.startedAt, jumpInNow)) return;
    if (jumpInSession.expiredEventSent) return;

    const saved = window.localStorage.getItem(JUMP_IN_STORAGE_KEY);
    if (saved) {
      try {
        const persisted = JSON.parse(saved) as JumpInSessionState;
        if (
          persisted.sessionId === jumpInSession.sessionId &&
          persisted.expiredEventSent
        ) {
          setJumpInSession(persisted);
          return;
        }
      } catch {
        // Replace malformed local state below.
      }
    }

    const expiredSession = {
      ...jumpInSession,
      expiredEventSent: true,
    };

    window.localStorage.setItem(
      JUMP_IN_STORAGE_KEY,
      JSON.stringify(expiredSession)
    );
    setJumpInSession(expiredSession);

    emitSignal("discovery.session_expired", signalSurface, {
      session_kind: "jump_in",
    });

    void fetch("/api/jump-in/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "session_expired",
        sessionId: expiredSession.sessionId,
      }),
    });
  }, [isJumpIn, jumpInExpired, jumpInNow, jumpInSession, signalSurface]);

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

      if (isJumpIn) {
        setIsSubscribed(false);
        setAccessResolved(true);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIsSubscribed(false);
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
        .select("access_level, trial_end_date")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile) {
        await supabase.from("profiles").insert({
          id: user.id,
        });
      } else {
        const accessLevel = profile.access_level;

        const trialEndDate = profile.trial_end_date
        ? new Date(profile.trial_end_date)
        : null;

        const trialActive =
        accessLevel === "trial" &&
        trialEndDate &&
        trialEndDate > new Date();

setIsBookTrial(Boolean(trialActive));
if (trialActive && trialEndDate) {
  const daysRemaining = Math.max(
    0,
    Math.ceil(
      (trialEndDate.getTime() - Date.now()) /
      (1000 * 60 * 60 * 24)
    )
  );

  setBookTrialDaysRemaining(daysRemaining);
} else {
  setBookTrialDaysRemaining(null);
}

      }

      setAccessResolved(true);
    }

    checkSubscription();
  }, [isJumpIn, supabase]);

  function startJumpInSession() {
    if (!isJumpIn) return null;

    const startedAt = jumpInSession?.startedAt ?? Date.now();
    const session: JumpInSessionState = {
      sessionId: jumpInSession?.sessionId ?? crypto.randomUUID(),
      sessionStartedEventSent:
        jumpInSession?.sessionStartedEventSent ?? true,
      expiredEventSent: false,
      startedAt,
    };

    window.localStorage.setItem(JUMP_IN_STORAGE_KEY, JSON.stringify(session));
    setJumpInSession(session);
    setJumpInNow(Date.now());
    return session;
  }

  function markJumpInExpired() {
    if (!isJumpIn || !jumpInSession) return;
    setJumpInNow(
      Math.max(Date.now(), (jumpInSession.startedAt ?? Date.now()) + JUMP_IN_DURATION_MS)
    );
  }

  function handleDayPassClick() {
    emitSignal("discovery.day_pass_clicked", signalSurface, {
      reason: jumpInExpired ? "session_expired" : "manual",
    });
    if (isJumpIn && jumpInSession) {
      void fetch("/api/jump-in/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "day_pass_clicked",
          sessionId: jumpInSession.sessionId,
        }),
        keepalive: true,
      });
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function handleSubscribe() {
    try {
      const signalIdentity = initializeSignalIdentity();
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...signalHeaders(signalSurface),
        },
        body: JSON.stringify({
          firstTouch: signalIdentity.firstTouch,
          lastTouch: signalIdentity.lastTouch,
        }),
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
    emitSignal("engagement.report_copied", signalSurface, { format, scope: "message" });

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
    emitSignal("engagement.report_copied", signalSurface, { format, scope: "all" });

    setCopiedAllKey(format);
    setTimeout(() => {
      setCopiedAllKey((current) => (current === format ? null : current));
    }, 2000);
  }

  function onClear() {
    if (isLoading) return;
    setMessages([]);
    setDraft("");
    setUrlDraft("");
    setUrlError(null);
    setImportedUrl(null);
    setCopiedAllKey(null);
    setCopiedMessageKey(null);
    messageContentRefs.current = {};
  }

  async function onSend() {
    if (sendLockRef.current || isRepeatedGraviton) return;

     if (!isJumpIn && !isSubscribed && !isBookTrial) {

    setMessages([

      {

        role: "assistant",

        content:

          "Full Gravitas access requires an active Day Pass or subscription.\n\nIf you only need another working session, you can get a new 48-hour Day Pass here:\n\nhttps://multirrupt.com/day-pass",

      },

    ]);

    return;

  }

    const runId = crypto.randomUUID();
    if (!runCoordinatorRef.current.tryStart(runId)) return;
    sendLockRef.current = true;
    emitSignal("analysis.started", signalSurface, {
      analysis_id: runId,
      source_mode: inputMode,
      graviton: toSignalIdentifier(selectedGraviton),
      cadence,
    });
    setIsLoading(true);
    setIsCapturingUrl(inputMode === "url");
    setAnalysisProgress(
      inputMode === "url"
        ? null
        : "Preparing your analysis…"
    );
    setUrlError(null);

    let raw = draft;
    let sourceIdentity: SourceIdentity | undefined;
    let urlSourceImages: SourceImage[] = [];

    try {
    if (inputMode === "url") {
      try {
        let source = importedUrl?.requestedUrl === urlDraft.trim()
          ? importedUrl.source
          : null;

        if (!source) {
          const sourceResponse = await fetch(
            isJumpIn ? "/api/jump-in/sources/url" : "/api/sources/url",
            {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: urlDraft }),
            }
          );
          const sourceData = (await sourceResponse.json().catch(() => ({
            error:
              sourceResponse.status === 504
                ? "The webpage took too long to render. Please try again."
                : "The webpage could not be imported.",
          }))) as {
            source?: UrlSource;
            error?: string;
          };
          if (!sourceResponse.ok || !sourceData.source) {
            if (!runCoordinatorRef.current.isCurrent(runId)) return;
            setUrlError(sourceData.error || "The webpage could not be imported.");
            return;
          }
          if (!runCoordinatorRef.current.isCurrent(runId)) return;
          source = sourceData.source;
          setImportedUrl({
            requestedUrl: urlDraft.trim(),
            source,
          });
        }
        raw = buildRenderedUrlAnalysisInput(
          source.extractedText,
          selectedGraviton,
          isJumpIn ? JUMP_IN_MAX_URL_VIEWPORTS : MAX_URL_VIEWPORTS
        );
        sourceIdentity = source;
        urlSourceImages = source.images;
        setIsCapturingUrl(false);
      } catch {
        if (!runCoordinatorRef.current.isCurrent(runId)) return;
        setUrlError("The webpage could not be imported. Check the address and try again.");
        return;
      }
    }
    const gravitonPrefix =
  selectedGraviton === "Full Analysis"
    ? ""
    : `Analysis Lens:
${selectedGraviton}

----------------------------------------

`;

const finalInput = gravitonPrefix + raw;
   if (imageFiles.length > 0) {
  console.log(
    "Images selected:",
    imageFiles.map((file) => file.name)
  );
}
    if (
      (!raw.trim() && imageFiles.length === 0 && urlSourceImages.length === 0) ||
      isLoading ||
      isDemoLocked
    )
      return;

    if (raw.length > 30000) {
      alert("That’s a large input. For best results, keep it under 30,000 characters.");
      return;
    }

    if (
      isJumpIn &&
      inputMode === "text" &&
      raw.trim().split(/\s+/).filter(Boolean).length > JUMP_IN_MAX_PASTED_WORDS
    ) {
      alert(
        `The free embedded session supports pasted text up to ${JUMP_IN_MAX_PASTED_WORDS} words.`
      );
      return;
    }

    const parsed = parseCommand(finalInput);
    console.log("GRAVITON:", selectedGraviton);
    console.log("FINAL INPUT:", finalInput);
    const text = parsed.content;

    if (!text && imageFiles.length === 0 && urlSourceImages.length === 0) {
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

    const activeJumpInSession = startJumpInSession();

    setAnalysisProgress(
      inputMode === "url"
        ? null
        : "Analysing the source from the reader’s side…"
    );

    setMessages((m) => [
      ...m,
      {
        role: "user",
        content:
          sourceIdentity?.type === "url"
            ? `${sourceIdentity.title}\n${sourceIdentity.originalLocation ?? ""}`
            : raw.trim(),
        sourceIdentity,
      },
      { role: "assistant", content: THINKING_TOKEN, runId },
    ]);

    scrollToBottom();

    const isHeresy = parsed.mode === "mr_heresy";
       let imageData: string[] = [];

if (urlSourceImages.length > 0) {
  imageData = urlSourceImages.map((image) => image.dataUrl);
} else if (imageFiles.length > 0) {
  imageData = await Promise.all(
    imageFiles.map(file => fileToBase64(file))
  );
}
    const effectiveText =
      text ||
      `Analyse the attached image${imageData.length === 1 ? "" : "s"} using the selected Gravitas lens: ${selectedGraviton}.`;

    setMessages((current) =>
      current.map((message, index) =>
        index === current.length - 2 && message.role === "user"
          ? {
              ...message,
              sourceContent: effectiveText,
              imageData,
              sourceImages:
                urlSourceImages.length > 0
                  ? urlSourceImages
                  : imageData.map((dataUrl, imageIndex) => ({
                      id: `uploaded-analysis-${imageIndex}`,
                      type: "image" as const,
                      title: imageFiles[imageIndex]?.name || `Image ${imageIndex + 1}`,
                      dataUrl,
                      altText: imageFiles[imageIndex]?.name,
                      order: imageIndex,
                    })),
              sourceIdentity,
            }
          : message
      )
    );

    const payload = isHeresy
      ? {
          mode: "mr_heresy",
          input: " ",
          context: `Apply Multirrupt Mode to the following text:\n\n${effectiveText}`,
          constraints: {},
          imageData,
          cadence,
          sourceMode: sourceIdentity?.type === "url" ? "rendered-url" : undefined,
          entitlementSourceText:
            isJumpIn && inputMode === "text" ? raw : undefined,
        }
      : {
          mode: "general",
          input: effectiveText,
          context: "",
          constraints: {},
          imageData,
          cadence,
          sourceMode: sourceIdentity?.type === "url" ? "rendered-url" : undefined,
          entitlementSourceText:
            isJumpIn && inputMode === "text" ? raw : undefined,
        };

    try {
      const res = await fetch(apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...signalHeaders(signalSurface),
          "X-Gravitas-Analysis-Id": runId,
          ...(activeJumpInSession
            ? { "X-Jump-In-Session-Id": activeJumpInSession.sessionId }
            : {}),
        },
        body: JSON.stringify(payload),
      });
      

      const data = await res.json();
      if (!runCoordinatorRef.current.isCurrent(runId)) return;
      const authoritativeStartedAt = Number(
        res.headers.get("X-Jump-In-Started-At")
      );

      if (
        isJumpIn &&
        Number.isFinite(authoritativeStartedAt)
      ) {
        setJumpInSession((current) => {
          if (!current) return current;
          const syncedSession = {
            ...current,
            startedAt: authoritativeStartedAt,
          };
          window.localStorage.setItem(
            JUMP_IN_STORAGE_KEY,
            JSON.stringify(syncedSession)
          );
          return syncedSession;
        });
      }

      if (res.status === 403 && data.expired) {
        markJumpInExpired();
        setMessages((m) =>
          m.filter(
            (msg) =>
              !(
                msg.role === "assistant" &&
                msg.content === THINKING_TOKEN &&
                msg.runId === runId
              )
          )
        );
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || "The analysis could not be completed.");
      }

      const normalizedOutput = normalizeAssistantHeadings(
        data.output || "No response."
      );

      setMessages((m) =>
        m.map((msg) =>
          msg.role === "assistant" &&
          msg.content === THINKING_TOKEN &&
          msg.runId === runId
            ? {
                role: "assistant",
                content: normalizedOutput,
                runId,
                analysisStatus: "success",
              }
            : msg
        )
      );
      setCompletedAnalysisRuns((current) => {
        const next = new Set(current);
        next.add(getAnalysisRunKey(activeSourceKey, selectedGraviton));
        return next;
      });

      const analysisJump = getRandomInt(14, 28);
      const rewriteJump = getRandomInt(36, 68);

      setAnalysisBoost((prev) => prev + analysisJump);
      setRewriteBoost((prev) => prev + rewriteJump);
      scrollToLatestEditorSummary();

    } catch (err) {
      if (!runCoordinatorRef.current.isCurrent(runId)) return;
      setMessages((m) =>
        m.map((msg) =>
          msg.role === "assistant" &&
          msg.content === THINKING_TOKEN &&
          msg.runId === runId
           ? {
               role: "assistant",
               content: `Something went wrong while analysing: ${String(err)}`,
               runId,
               analysisStatus: "error",
             }
            : msg
        )
      );
      scrollToBottom();
    }
    } finally {
      if (!runCoordinatorRef.current.finish(runId)) return;
      sendLockRef.current = false;
      setIsLoading(false);
      setIsCapturingUrl(false);
      setAnalysisProgress(null);
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
  const narrativesRefinedToday = Math.min(
    rewritesToday,
    Math.floor(analysesToday * 1.2)
  );

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

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-2xl font-semibold tracking-tight">
              {isJumpIn ? "Jump Into Gravitas" : "Multirrupt – GRAVITAS"}
            </div>
            <div className="mt-1 text-sm text-neutral-400">
              {isJumpIn
                ? "Full Gravitas. 20 minutes. No signup required."
                : "Narrative Intelligence Workstation"}
            </div>
            {isJumpIn ? (
              <div
                className={classNames(
                  "mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
                  jumpInExpired
                    ? "border-amber-700/70 bg-amber-950/40 text-amber-200"
                    : "border-neutral-700 bg-neutral-900 text-neutral-300"
                )}
              >
                {jumpInExpired
                  ? "Free session ended"
                  : jumpInSession?.startedAt === null
                    ? "20:00 starts with your first analysis"
                    : `${formatJumpInRemaining(jumpInRemainingMs)} remaining`}
              </div>
            ) : null}
            {bookTrialDaysRemaining !== null && (
  <div className="mt-1 text-xs text-neutral-500">
    Gravitas Day Pass active • {bookTrialDaysRemaining} day
    {bookTrialDaysRemaining === 1 ? "" : "s"} remaining
  </div>
)}

            <div className="mt-1 space-y-0.5 text-xs text-neutral-500">
              <div>Analyses today: {analysesToday}</div>
              <div>Narratives refined: {narrativesRefinedToday}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {!isJumpIn && isSubscribed === false ? (
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

            {messages.length > 0 ? (
              <>
                <button
                  onClick={() => onCopyAll("email")}
                  data-copy-ui="true"
                  className="rounded-xl border border-neutral-800 px-3 py-2 text-sm hover:bg-neutral-900"
                >
                  {copiedAllKey === "email" ? "✓ Copied Email" : "Copy All Email"}
                </button>

                <button
                  onClick={() => onCopyAll("word")}
                  data-copy-ui="true"
                  className="rounded-xl border border-neutral-800 px-3 py-2 text-sm hover:bg-neutral-900"
                >
                  {copiedAllKey === "word" ? "✓ Copied Word" : "Copy All Word"}
                </button>

                <button
                  onClick={onClear}
                  data-copy-ui="true"
                  disabled={isLoading}
                  className="rounded-xl border border-neutral-800 px-3 py-2 text-sm hover:bg-neutral-900 disabled:cursor-not-allowed disabled:text-neutral-600"
                >
                  Clear
                </button>
              </>
            ) : null}
            {!isJumpIn ? (
              <button
                onClick={handleLogout}
                data-copy-ui="true"
                className="rounded-xl border border-neutral-800 px-3 py-2 text-sm hover:bg-neutral-900"
              >
                Logout
              </button>
            ) : null}
          </div>
        </header>

        {isJumpIn && jumpInExpired ? (
          <section className="mb-4 rounded-2xl border border-amber-700/60 bg-amber-950/30 p-5">
            <h2 className="text-lg font-semibold text-amber-100">
              Your 20-minute Jump In has ended.
            </h2>
            <p className="mt-2 text-sm leading-6 text-amber-100/80">
              Everything you created remains visible and copyable. For another
              working session, continue with 48 hours of full Gravitas access.
            </p>
            <a
              href={JUMP_IN_DAY_PASS_URL}
              target="_top"
              onClick={handleDayPassClick}
              className="mt-4 inline-flex rounded-xl border px-5 py-3 text-sm font-semibold text-black shadow-sm transition hover:brightness-110"
              style={{
                backgroundColor: MR_GOLD,
                borderColor: MR_GOLD,
              }}
            >
              Get the US$19 48-Hour Day Pass
            </a>
          </section>
        ) : null}

        <div
          ref={scrollerRef}
          className={classNames(
            "rounded-2xl border border-neutral-800 bg-neutral-950 p-4",
            isJumpIn && messages.length === 0 && !jumpInExpired
              ? "min-h-[460px] overflow-visible sm:min-h-[540px]"
              : "h-[60vh] overflow-y-auto"
          )}
        >
          {messages.length === 0 ? (
            <div className="text-[17px] leading-7 text-neutral-400">
              {imagePreviewUrls.length > 0 && (
            <div className="grid grid-cols-4 gap-3">
             {imagePreviewUrls.map((url, i) => (
  <div key={i} className="relative">
    <img
      src={url}
      alt={`preview-${i}`}
      className="h-32 w-full rounded-lg object-cover border border-neutral-800"
    />
    <button
  onClick={() =>
    setImageFiles((prev) => prev.filter((_, index) => index !== i))
  }
  className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/80 text-white text-xs"
>
  ×
</button>
  </div>
))}
  </div>
)}

              {isJumpIn && !jumpInExpired && imagePreviewUrls.length === 0 ? (
                <JumpInWelcome />
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m, i) => {
                const isThinking =
                  m.role === "assistant" && m.content === THINKING_TOKEN;

                const visibleUserContent =
                  m.role === "user"
                    ? m.content.includes("----------------------------------------")
                      ? m.content.split("----------------------------------------").slice(1).join("----------------------------------------").trim()
                      : m.content.trim()
                    : "";

                if (m.role === "user" && visibleUserContent.length === 0) return null;

                const sourceRaw =
                  m.role === "assistant" && i > 0 && messages[i - 1]?.role === "user"
                    ? messages[i - 1].sourceContent ?? messages[i - 1].content
                    : "";
                const sourceImageData =
                  m.role === "assistant" && i > 0 && messages[i - 1]?.role === "user"
                    ? messages[i - 1].imageData ?? []
                    : [];
                const sourceIdentity =
                  m.role === "assistant" && i > 0 && messages[i - 1]?.role === "user"
                    ? messages[i - 1].sourceIdentity
                    : undefined;
                const sourceImages =
                  m.role === "assistant" && i > 0 && messages[i - 1]?.role === "user"
                    ? messages[i - 1].sourceImages ?? []
                    : [];

                return (
                  <div
                    key={i}
                   className={classNames(
                     "group rounded-2xl border px-4 py-4",
                    m.role === "user"
                      ? "border-neutral-800 bg-neutral-950/60"
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
                        {m.role === "user" ? "Content Analysed" : "MR"}
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
                        <>
                          <StructuredAssistantMessage
                            content={m.content}
                            sourceRaw={sourceRaw}
                            sourceImageData={sourceImageData}
                            sourceImages={sourceImages}
                            sourceIdentity={sourceIdentity}
                            cadence={cadence}
                            apiEndpoint={apiEndpoint}
                            interactionLocked={isDemoLocked}
                            onSessionExpired={markJumpInExpired}
                            onRewriteProduced={() => {
                              setAnalysisBoost((prev) => prev + getRandomInt(6, 14));
                              setRewriteBoost((prev) => prev + getRandomInt(24, 46));
                            }}
                            onInteractionSignal={(name, properties) =>
                              emitSignal(name, signalSurface, properties)
                            }
                          />
                          {shouldShowAnalysisEasterEgg(m.analysisStatus) ? (
                            <p
                              data-analysis-easter-egg="true"
                              className="mt-5 text-center text-[11px] italic tracking-wide text-neutral-600"
                            >
                              No Gravitons were injured during this analysis.
                            </p>
                          ) : null}
                        </>
                      ) : (
                      <div className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-neutral-300">
                        {visibleUserContent}
                      </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
  <div className="mb-3 flex flex-wrap gap-2" aria-label="Source type">
    {([
      ["text", "Text"],
      ["url", "URL"],
      ["images", "Images"],
    ] as const).map(([value, label]) => (
      <button
        key={value}
        type="button"
        onClick={() => {
          emitSignal("discovery.source_selected", signalSurface, {
            source_mode: value,
          });
          setInputMode(value);
          setUrlError(null);
          setImportedUrl(null);
          if (value !== "images") setImageFiles([]);
          if (value !== "text") setDraft("");
        }}
        disabled={isDemoLocked}
        className={classNames(
          "rounded-lg border px-3 py-2 text-xs font-semibold transition",
          inputMode === value
            ? "border-[#C6A75A] bg-[#C6A75A]/10 text-[#C6A75A]"
            : "border-neutral-800 text-neutral-400 hover:bg-neutral-900",
          isDemoLocked && "cursor-not-allowed opacity-60"
        )}
      >
        {label}
      </button>
    ))}
  </div>

  {inputMode === "url" ? (
    <div className="min-h-[38px]">
      {isCapturingUrl ? (
        <div
          data-url-capture-progress="true"
          className="pb-3"
          role="status"
          aria-live="polite"
        >
          <p className="mb-2 text-sm font-medium text-[#C6A75A]">
            Capturing page viewports…
          </p>
          <div
            className="h-2 overflow-hidden rounded-full bg-neutral-800"
            aria-hidden="true"
          >
            <div className="gravitas-capture-progress h-full w-1/3 rounded-full bg-[#C6A75A]" />
          </div>
        </div>
      ) : null}
    </div>
  ) : null}

  {inputMode === "url" ? (
    <div>
      <input
        type="url"
        value={urlDraft}
        onChange={(event) => {
          setUrlDraft(event.target.value);
          setUrlError(null);
          setImportedUrl(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void onSend();
          }
        }}
        disabled={isDemoLocked}
        placeholder="Paste a webpage URL"
        className={classNames(
          "h-[56px] w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 text-[17px] text-neutral-100 outline-none focus:border-neutral-600",
          isDemoLocked && "cursor-not-allowed opacity-60"
        )}
      />
      {urlDraft.trim().length > 0 && !isValidPublicHttpUrl(urlDraft) ? (
        <p className="mt-2 text-sm text-amber-300">
          Enter a complete public http:// or https:// webpage address.
        </p>
      ) : null}
      <p className="mt-2 text-xs text-neutral-500">
        Gravitas renders the page and analyses up to{" "}
        {isJumpIn ? JUMP_IN_MAX_URL_VIEWPORTS : MAX_URL_VIEWPORTS} ordered
        viewports.
        Extracted text is used only to clarify wording that is difficult to read in the captures.
      </p>
      {importedUrl?.source.truncated ? (
        <p className="mt-2 text-xs text-neutral-500">
          This is a long page. Gravitas will analyse the first complete working section in this pass.
        </p>
      ) : null}
      {urlError ? (
        <p className="mt-2 text-sm text-amber-300">{urlError}</p>
      ) : null}
    </div>
  ) : inputMode === "images" ? (
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      disabled={isDemoLocked}
      className="h-[56px] w-full rounded-xl border border-neutral-800 px-5 text-sm font-semibold text-neutral-200 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
    >
      Select up to 10 images
    </button>
  ) : (
  <textarea
    value={draft}
    onChange={(e) => {
  setDraft(e.target.value);

  if (e.target.value.trim().length > 0 && imageFiles.length > 0) {
    setImageFiles([]);
  }
}}
    onKeyDown={onKeyDown}
    disabled={isDemoLocked}
    placeholder="Paste here"
    className={classNames(
      "h-[96px] w-full resize-none rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-[17px] leading-7 text-neutral-100 outline-none focus:border-neutral-600",
      isDemoLocked && "cursor-not-allowed opacity-60"
    )}
  />
  )}

  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
    <select
      value={selectedGraviton}
      onChange={(e) => setSelectedGraviton(e.target.value)}
      disabled={isDemoLocked}
      aria-label="Gravitons"
      className="h-[56px] w-full min-w-0 flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {gravitonGroups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.options.map((option) => (
            <option key={option} value={option}>
             {option === "Full Analysis"
               ? "Gravitons: Full Analysis (Default)"
               : option}
           </option>
      ))}
    </optgroup>
))}
    </select>

    <select
      value={cadence}
      onChange={(event) => setCadence(event.target.value as CadenceMode)}
      disabled={isDemoLocked}
      aria-label="Cadence"
      title={CADENCE_OPTIONS.find((option) => option.value === cadence)?.description}
      className="h-[56px] w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-200 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      {CADENCE_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          Cadence: {option.label}
        </option>
      ))}
    </select>

    <button
      onClick={onSend}
      data-copy-ui="true"
      disabled={!canSend}
      className="h-[56px] w-full rounded-xl bg-neutral-100 px-5 text-sm font-semibold text-neutral-950 hover:bg-white disabled:bg-neutral-800 disabled:text-neutral-500 sm:w-auto"
    >
      {isLoading ? "Working…" : "Gravitate"}
    </button>
  </div>
  {analysisProgress ? (
    <p className="mt-2 text-sm text-[#C6A75A]" role="status" aria-live="polite">
      {analysisProgress}
    </p>
  ) : null}
  {isRepeatedGraviton ? (
    <p className="mt-2 text-sm text-[#C6A75A]">
      Select a different Graviton to analyse this source again.
    </p>
  ) : null}

  <input
    ref={fileInputRef}
    type="file"
    multiple
    accept="image/png,image/jpeg,image/webp"
    onChange={async (e) => {
      const files = Array.from(e.target.files ?? []);
      const limitedFiles = files.slice(0, 10);
      const compressedFiles = await Promise.all(
        limitedFiles.map((file) => compressImage(file))
      );

      setImageFiles(compressedFiles);
      setInputMode("images");
      setDraft("");
    }}
    disabled={isDemoLocked}
    className="hidden"
  />

  {imageFiles.length > 0 && (
    <div className="mt-2 text-xs text-neutral-500">
      {imageFiles.length} image(s) selected
    </div>
  )}
</div>

  {selectedSourceImages.length > 0 && (
  <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
    <div className="mb-3 flex items-center justify-between">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
        Content Under Review
      </div>

      <div className="text-xs text-neutral-500">
        {importedUrl?.source.captureMode === "rendered-viewports"
          ? `${selectedSourceImages.length} viewport${selectedSourceImages.length === 1 ? "" : "s"}`
          : `${selectedSourceImages.length} image${selectedSourceImages.length === 1 ? "" : "s"}`}
      </div>
    </div>

    <SourceImageStrip images={selectedSourceImages} />

  </div>
)}
          
        
      </div>
    </main>
  );
}
