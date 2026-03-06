"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const THINKING_TOKEN = "__MR_THINKING__";
const MR_GOLD = "#C6A75A";

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
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

function getSectionKind(line: string): "summary" | "depth" | "rewrite" | "debrief" | null {
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

/**
 * Richer renderer:
 * - headings
 * - dividers
 * - quotes
 * - lists using - or •
 * - inline **bold**, *italic*, `code`
 * - preserves nice body rhythm
 */
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
    nodes.push({ type: "para", text: para.join("\n").trim(), key: `p-${i}-${para.length}` });
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

          const Tag = (`h${level}` as keyof JSX.IntrinsicElements);

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

function StructuredAssistantMessage({
  content,
  onCopyText,
}: {
  content: string;
  onCopyText: (text: string) => Promise<void> | void;
}) {
  const { hasStructured, sections } = useMemo(() => parseStructuredMR(content), [content]);
  const rewriteRef = useRef<HTMLDivElement | null>(null);
  const [showRewrite, setShowRewrite] = useState(false);

  useEffect(() => {
    setShowRewrite(false);
  }, [content]);

  if (!hasStructured) {
    return <div className="text-[17px] leading-7">{renderMR(content)}</div>;
  }

  const summary = sections.summary?.trim();
  const depth = sections.depth?.trim();
  const rewrite = sections.rewrite?.trim();
  const debrief = sections.debrief?.trim();

  const revealRewrite = () => {
    setShowRewrite(true);
    setTimeout(() => {
      rewriteRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  return (
    <div className="space-y-5">
      {summary ? (
        <section>
          <h2 className="text-[20px] font-semibold tracking-tight text-neutral-100">
            Editor’s Summary
          </h2>
          <div className="mt-3">{renderMR(summary)}</div>

          {rewrite && !showRewrite ? (
            <div className="mt-5">
              <button
                onClick={revealRewrite}
                className="rounded-xl border px-6 py-3 text-sm font-semibold text-black transition hover:brightness-110"
                style={{
                  backgroundColor: MR_GOLD,
                  borderColor: MR_GOLD,
                }}
              >
                Rewrite
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
              <span className="text-xs uppercase tracking-widest text-neutral-500">Click to expand</span>
            </div>
          </summary>
          <div className="border-t border-neutral-800 px-4 py-4">
            {renderMR(depth)}
          </div>
        </details>
      ) : null}

      {rewrite && showRewrite ? (
        <section
          ref={rewriteRef}
          className="rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-5"
        >
          <div
            className="mb-6 h-[2px] w-full rounded-full"
            style={{ backgroundColor: MR_GOLD }}
          />

          <div className="mb-4 flex items-center justify-between gap-3">
            <h2
              className="text-[20px] font-semibold tracking-tight"
              style={{ color: MR_GOLD }}
            >
              Rewrite
            </h2>

            <button
              onClick={() => onCopyText(rewrite)}
              className="rounded-xl border px-3 py-2 text-sm font-semibold transition"
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
              Copy rewrite
            </button>
          </div>

          <div>{renderMR(rewrite)}</div>
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

/**
 * Dev-only command parser.
 * - "/h <text>" or "/heresy <text>" => MR Heresy mode
 */
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
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => draft.trim().length > 0 && !isLoading, [draft, isLoading]);

  function scrollToBottom() {
    setTimeout(() => {
      const el = scrollerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  async function onCopyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  }

  async function onCopyMessage(index: number) {
    const msg = messages[index];
    if (!msg) return;
    if (msg.role === "assistant" && msg.content === THINKING_TOKEN) return;
    await onCopyText(msg.content);
  }

  async function onCopyAll() {
    if (messages.length === 0) return;
    const lines = messages
      .filter((m) => !(m.role === "assistant" && m.content === THINKING_TOKEN))
      .map((m) => `${m.role === "user" ? "You" : "MR"}: ${m.content}`);
    await onCopyText(lines.join("\n\n"));
  }

  function onClear() {
    if (isLoading) return;
    setMessages([]);
    setDraft("");
  }

  async function onSend() {
    const raw = draft;
    if (!raw.trim() || isLoading) return;

    const parsed = parseCommand(raw);
    const text = parsed.content;

    if (!text) {
      setDraft("");
      setMessages((m) => [
        ...m,
        { role: "user", content: raw.trim() },
        { role: "assistant", content: "Heresy mode: paste the text after /h (e.g. “/h <paste text>”)." },
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
    } catch {
      setMessages((m) =>
        m.map((msg) =>
          msg.role === "assistant" && msg.content === THINKING_TOKEN
            ? { role: "assistant", content: "Something went wrong while analysing." }
            : msg
        )
      );
    } finally {
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

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-2xl font-semibold tracking-tight">Multirrupt - GRAVITAS</div>
            <div className="mt-1 text-sm text-neutral-400">
              Narrative engineering for persuasion, clarity, and conversion.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onCopyAll}
              disabled={messages.length === 0}
              className="rounded-xl border border-neutral-800 px-3 py-2 text-sm hover:bg-neutral-900 disabled:cursor-not-allowed disabled:text-neutral-600"
            >
              Copy all
            </button>
            <button
              onClick={onClear}
              disabled={messages.length === 0 || isLoading}
              className="rounded-xl border border-neutral-800 px-3 py-2 text-sm hover:bg-neutral-900 disabled:cursor-not-allowed disabled:text-neutral-600"
            >
              Clear
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
              <div className="mt-2 text-neutral-700">
                Dev: type <span className="text-neutral-400">/h</span> at the start of a message to run MR Heresy mode.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m, i) => {
                const isThinking = m.role === "assistant" && m.content === THINKING_TOKEN;

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
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-xs uppercase tracking-widest text-neutral-400">
                        {m.role === "user" ? "You" : "MR"}
                      </div>
                      <button
                        onClick={() => onCopyMessage(i)}
                        disabled={isThinking}
                        className="rounded-lg border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:text-neutral-600"
                      >
                        Copy
                      </button>
                    </div>

                    <div className="text-[17px] leading-7">
                      {isThinking ? (
                        <span className="italic text-emerald-200/80">Thinking…</span>
                      ) : m.role === "assistant" ? (
                        <StructuredAssistantMessage content={m.content} onCopyText={onCopyText} />
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
              placeholder="Paste your text here…"
              className="h-[56px] w-full resize-none rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-[17px] leading-7 text-neutral-100 outline-none focus:border-neutral-600"
            />
            <button
              onClick={onSend}
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