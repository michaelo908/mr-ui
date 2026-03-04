"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const THINKING_TOKEN = "__MR_THINKING__";

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** ---------- Parsing + Rendering ---------- */

type Node =
  | { type: "heading"; level: number; text: string; key: string }
  | { type: "hr"; key: string }
  | { type: "quote"; lines: string[]; key: string }
  | { type: "list"; items: string[]; key: string }
  | { type: "para"; text: string; key: string }
  | { type: "spacer"; key: string };

function parseMR(content: string): Node[] {
  const lines = content.split(/\r?\n/);
  const nodes: Node[] = [];
  let i = 0;

  const pushSpacerIfNeeded = () => {
    const prev = nodes[nodes.length - 1];
    if (prev && prev.type !== "spacer") nodes.push({ type: "spacer", key: `s-${i}-${nodes.length}` });
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

    if (/^- /.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^- /.test((lines[i] ?? "").trim())) {
        items.push((lines[i] ?? "").trim().replace(/^- /, ""));
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
      if (/^- /.test(t)) break;
      para.push(l);
      i++;
    }
    nodes.push({ type: "para", text: para.join("\n").trim(), key: `p-${i}-${para.length}` });
  }

  return nodes;
}

type RenderMROpts = {
  showRewriteButtons?: boolean;
  onRevealRewrite?: () => void;
  disableRewrite?: boolean;
  messageIndex?: number;
};

function renderMR(content: string, opts?: RenderMROpts) {
  const nodes = parseMR(content);

  function renderInline(text: string) {
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);

    return parts.map((p, idx) => {
      if (!p) return null;

      const code = p.match(/^`([^`]+)`$/);
      if (code) {
        return (
          <code
            key={idx}
            className="rounded-md border border-neutral-800 bg-neutral-900/50 px-1.5 py-0.5 text-[0.95em] text-neutral-200"
          >
            {code[1]}
          </code>
        );
      }

      const bold = p.match(/^\*\*([^*]+)\*\*$/);
      if (bold) {
        return (
          <strong key={idx} className="font-semibold text-neutral-100">
            {bold[1]}
          </strong>
        );
      }

      const italic = p.match(/^\*([^*]+)\*$/);
      if (italic) {
        return (
          <em key={idx} className="italic text-neutral-200">
            {italic[1]}
          </em>
        );
      }

      return <span key={idx}>{p}</span>;
    });
  }

  const showButtons = Boolean(opts?.showRewriteButtons && opts?.onRevealRewrite);

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
          const txt = (n.text ?? "").trim();
          const isES = txt === "Executive Summary";
          const isDepth = txt === "Diagnosis in Depth";
          const isRewriteHeading = txt === "Rewrite";

          const cls =
            level === 1
              ? "text-[22px] font-semibold"
              : level === 2
                ? "text-[20px] font-semibold"
                : "text-[18px] font-semibold";

          const Tag = (`h${level}` as keyof JSX.IntrinsicElements);

          // Gold only for the "Rewrite" heading (phase shift marker)
          const headingColor = isRewriteHeading ? "text-[#b08d2a]" : "text-neutral-100";

          const rewriteId = typeof opts?.messageIndex === "number" ? `mr-rewrite-${opts.messageIndex}` : undefined;

          const headingEl = (
            <Tag
              key={n.key}
              id={isRewriteHeading ? rewriteId : undefined}
              className={classNames("mt-6 first:mt-0 tracking-tight", cls, headingColor)}
            >
              {renderInline(n.text)}
            </Tag>
          );

          // Buttons under ES + under Depth
          if (showButtons && (isES || isDepth)) {
            return (
              <div key={n.key} className="mt-6 first:mt-0">
                <div className="flex items-center justify-between gap-3">
                  {headingEl}
                  <button
                    onClick={opts?.onRevealRewrite}
                    disabled={Boolean(opts?.disableRewrite)}
                    className={classNames(
                      "rounded-xl border px-3 py-2 text-sm font-semibold",
                      "border-neutral-700 hover:bg-neutral-800",
                      opts?.disableRewrite ? "cursor-not-allowed text-neutral-600" : "text-neutral-100"
                    )}
                    title="Reveal Rewrite + Rewrite Debrief"
                  >
                    Rewrite
                  </button>
                </div>
              </div>
            );
          }

          return headingEl;
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

        const paraLines = n.text.split("\n");
        return (
          <p key={n.key} className="my-2 text-[17px] leading-7 text-neutral-200">
            {paraLines.map((line, idx) => (
              <span key={idx}>
                {renderInline(line)}
                {idx < paraLines.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/** ---------- Clipboard Export (Rich: text/plain + text/html) ---------- */

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function inlineToHtml(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts
    .map((p) => {
      if (!p) return "";
      const code = p.match(/^`([^`]+)`$/);
      if (code) return `<code>${escapeHtml(code[1])}</code>`;
      const bold = p.match(/^\*\*([^*]+)\*\*$/);
      if (bold) return `<strong>${escapeHtml(bold[1])}</strong>`;
      const italic = p.match(/^\*([^*]+)\*$/);
      if (italic) return `<em>${escapeHtml(italic[1])}</em>`;
      return escapeHtml(p);
    })
    .join("");
}

function renderMRToPlainText(content: string) {
  const nodes = parseMR(content);

  const stripInline = (s: string) =>
    s
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1");

  const out: string[] = [];

  for (const n of nodes) {
    if (n.type === "spacer") {
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }

    if (n.type === "hr") {
      out.push("");
      out.push("────────────────────────────────");
      out.push("");
      continue;
    }

    if (n.type === "heading") {
      out.push("");
      out.push(stripInline(n.text).trim());
      out.push("");
      continue;
    }

    if (n.type === "quote") {
      out.push("");
      for (const q of n.lines) out.push(`> ${stripInline(q).trim()}`);
      out.push("");
      continue;
    }

    if (n.type === "list") {
      out.push("");
      for (const it of n.items) out.push(`• ${stripInline(it).trim()}`);
      out.push("");
      continue;
    }

    const p = stripInline(n.text).trim();
    if (p) {
      out.push(p);
      out.push("");
    }
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function renderMRToHtml(content: string) {
  const nodes = parseMR(content);

  const css = `
    body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; font-size: 14px; line-height: 1.55; color: #111; }
    h1,h2,h3,h4,h5,h6 { margin: 18px 0 10px; font-weight: 700; }
    h1 { font-size: 20px; } h2 { font-size: 18px; } h3 { font-size: 16px; }
    p { margin: 8px 0; }
    hr { border: 0; border-top: 1px solid #ddd; margin: 14px 0; }
    blockquote { margin: 10px 0; padding: 10px 12px; border-left: 3px solid #ccc; background: #f7f7f7; }
    ul { margin: 8px 0 8px 22px; }
    li { margin: 4px 0; }
    code { font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace; font-size: 0.95em; background: #f2f2f2; border: 1px solid #e3e3e3; padding: 1px 4px; border-radius: 4px; }
    em { font-style: italic; }
    strong { font-weight: 700; }
  `.trim();

  const chunks: string[] = [];

  for (const n of nodes) {
    if (n.type === "spacer") {
      chunks.push(`<p></p>`);
      continue;
    }
    if (n.type === "hr") {
      chunks.push(`<hr/>`);
      continue;
    }
    if (n.type === "heading") {
      const level = Math.min(Math.max(n.level, 1), 6);
      chunks.push(`<h${level}>${inlineToHtml(n.text)}</h${level}>`);
      continue;
    }
    if (n.type === "quote") {
      const ps = n.lines.map((q) => `<p>${inlineToHtml(q)}</p>`).join("");
      chunks.push(`<blockquote>${ps}</blockquote>`);
      continue;
    }
    if (n.type === "list") {
      const lis = n.items.map((it) => `<li>${inlineToHtml(it)}</li>`).join("");
      chunks.push(`<ul>${lis}</ul>`);
      continue;
    }
    const lines = n.text.split("\n").map((l) => inlineToHtml(l));
    chunks.push(`<p>${lines.join("<br/>")}</p>`);
  }

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>${css}</style>
</head>
<body>
${chunks.join("\n")}
</body>
</html>`;
}

function renderUserToHtml(text: string) {
  const css = `
    body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; font-size: 14px; line-height: 1.55; color: #111; }
    pre { white-space: pre-wrap; margin: 0; }
  `.trim();

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>${css}</style>
</head>
<body>
<pre>${escapeHtml(text.trim())}</pre>
</body>
</html>`;
}

async function writeClipboardRich(opts: { plain: string; html: string }) {
  try {
    // @ts-ignore
    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      // @ts-ignore
      const item = new ClipboardItem({
        "text/plain": new Blob([opts.plain], { type: "text/plain" }),
        "text/html": new Blob([opts.html], { type: "text/html" }),
      });
      // @ts-ignore
      await navigator.clipboard.write([item]);
      return;
    }
  } catch {
    // fall through
  }

  try {
    await navigator.clipboard.writeText(opts.plain);
  } catch {}
}

/** ---------- Commands ---------- */

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

/** ---------- Helpers ---------- */

// Detect if assistant output contains the 4 mandatory sections
function isLayeredFourSectionOutput(content: string) {
  const t = (content || "").toLowerCase();
  return (
    t.includes("## executive summary") &&
    t.includes("## diagnosis in depth") &&
    t.includes("## rewrite") &&
    t.includes("## rewrite debrief")
  );
}

// For display: hide everything from "## Rewrite" onwards until revealed
function hideRewriteForDisplay(full: string) {
  const idx = full.toLowerCase().indexOf("## rewrite");
  if (idx === -1) return full;
  return full.slice(0, idx).trimEnd();
}

/** ---------- Page ---------- */

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // per-message reveal state (assistant message index -> revealed)
  const [revealedRewrite, setRevealedRewrite] = useState<Record<number, boolean>>({});

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

  function buildContext(history: Msg[], maxTurns = 8) {
    const clean = history
      .filter((m) => !(m.role === "assistant" && m.content === THINKING_TOKEN))
      .slice(-maxTurns);

    if (clean.length === 0) return "";

    return clean
      .map((m) => `${m.role === "user" ? "You" : "MR"}:\n${m.content}`)
      .join("\n\n");
  }

  function exportPlain(msg: Msg) {
    if (msg.role === "assistant") return renderMRToPlainText(msg.content);
    return msg.content.trim();
  }

  function exportHtml(msg: Msg) {
    if (msg.role === "assistant") return renderMRToHtml(msg.content);
    return renderUserToHtml(msg.content);
  }

  async function onCopyMessage(index: number) {
    const msg = messages[index];
    if (!msg) return;
    if (msg.role === "assistant" && msg.content === THINKING_TOKEN) return;

    const plain = exportPlain(msg);
    const html = exportHtml(msg);
    await writeClipboardRich({ plain, html });
  }

  async function onCopyAll() {
    if (messages.length === 0) return;

    const plainBlocks: string[] = [];
    for (const m of messages) {
      if (m.role === "assistant" && m.content === THINKING_TOKEN) continue;
      plainBlocks.push(`${m.role === "user" ? "You" : "MR"}:\n${exportPlain(m)}`);
    }
    const plain = plainBlocks.join("\n\n");

    const css = `
      body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; font-size: 14px; line-height: 1.55; color: #111; }
      .label { font-weight: 700; margin: 18px 0 8px; }
      .block { margin-bottom: 18px; }
      hr { border: 0; border-top: 1px solid #ddd; margin: 18px 0; }
    `.trim();

    const htmlBlocks = messages
      .filter((m) => !(m.role === "assistant" && m.content === THINKING_TOKEN))
      .map((m) => {
        const label = m.role === "user" ? "You" : "MR";
        const fragment = m.role === "assistant" ? renderMRToHtml(m.content) : renderUserToHtml(m.content);
        const bodyOnly = fragment.split("<body>")[1]?.split("</body>")[0] ?? `<pre>${escapeHtml(m.content)}</pre>`;
        return `<div class="block"><div class="label">${escapeHtml(label)}:</div>${bodyOnly}</div>`;
      })
      .join(`<hr/>`);

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>${css}</style>
</head>
<body>
${htmlBlocks}
</body>
</html>`;

    await writeClipboardRich({ plain, html });
  }

  function onClear() {
    if (isLoading) return;
    setMessages([]);
    setDraft("");
    setRevealedRewrite({});
  }

  async function sendRaw(raw: string) {
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

    setIsLoading(true);

    // Add user + thinking token
    setMessages((m) => [...m, { role: "user", content: raw.trim() }, { role: "assistant", content: THINKING_TOKEN }]);
    scrollToBottom();

    const isHeresy = parsed.mode === "mr_heresy";
    const context = buildContext([...messages, { role: "user", content: raw.trim() }], 8);

    const payload = isHeresy
      ? {
          mode: "mr_heresy",
          input: " ",
          context: `Conversation context:\n\n${context}\n\nApply Multirrupt Mode to the following text:\n\n${text}`,
          constraints: {},
        }
      : {
          mode: "general",
          input: text,
          context: `Conversation context:\n\n${context}`,
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

  async function onSend() {
    const raw = draft;
    if (!raw.trim() || isLoading) return;
    setDraft("");
    await sendRaw(raw.trim());
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  function revealRewriteForMessage(i: number) {
    setRevealedRewrite((prev) => ({ ...prev, [i]: true }));
    // scroll to Rewrite heading for this message after it renders
    setTimeout(() => {
      const el = document.getElementById(`mr-rewrite-${i}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      else scrollToBottom();
    }, 60);
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-2xl font-semibold tracking-tight">Multirrupt - GRAVITAS</div>
            <div className="mt-1 text-sm text-neutral-400">Narrative engineering for persuasion, clarity, and conversion.</div>
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

        <div ref={scrollerRef} className="h-[60vh] overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
          {messages.length === 0 ? (
            <div className="text-[17px] leading-7 text-neutral-400">
              Start by pasting an email, landing page, ad, or just ask a question.
              <div className="mt-2 text-neutral-600">
                Tip: <span className="text-neutral-400">Enter</span> sends, <span className="text-neutral-400">Shift+Enter</span> makes a new line.
              </div>
              <div className="mt-2 text-neutral-700">
                Dev: type <span className="text-neutral-400">/h</span> at the start of a message to run MR Heresy mode.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m, i) => {
                const isThinking = m.role === "assistant" && m.content === THINKING_TOKEN;
                const isFourSection = m.role === "assistant" && !isThinking && isLayeredFourSectionOutput(m.content);
                const isRevealed = Boolean(revealedRewrite[i]);

                // display-only: hide rewrite until revealed
                const displayContent =
                  m.role === "assistant" && isFourSection && !isRevealed ? hideRewriteForDisplay(m.content) : m.content;

                const showRewriteButtons =
                  m.role === "assistant" && !isThinking && isFourSection && !isRevealed;

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
                      <div className="text-xs uppercase tracking-widest text-neutral-400">{m.role === "user" ? "You" : "MR"}</div>
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
                        renderMR(displayContent, {
                          showRewriteButtons,
                          onRevealRewrite: () => revealRewriteForMessage(i),
                          disableRewrite: isLoading,
                          messageIndex: i,
                        })
                      ) : (
                        <p className="my-2 whitespace-pre-wrap text-[17px] leading-7 text-neutral-200">{m.content}</p>
                      )}
                    </div>

                    {/* When revealed, render the hidden portion below by rendering the full message again is redundant.
                        So we simply rely on displayContent becoming full content. */}
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
              className="h-[56px] rounded-xl px-5 text-sm font-semibold bg-neutral-100 text-neutral-950 hover:bg-white disabled:bg-neutral-800 disabled:text-neutral-500"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}