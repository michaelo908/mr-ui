"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const THINKING_TOKEN = "__MR_THINKING__";

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(
    () => draft.trim().length > 0 && !isLoading,
    [draft, isLoading]
  );

  function scrollToBottom() {
    setTimeout(() => {
      const el = scrollerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }

  useEffect(() => {
    scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  async function onCopyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback: do nothing (clipboard perms can be weird)
    }
  }

  async function onCopyMessage(index: number) {
    const msg = messages[index];
    if (!msg) return;

    const isThinking = msg.role === "assistant" && msg.content === THINKING_TOKEN;
    if (isThinking) return;

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
    const text = draft.trim();
    if (!text || isLoading) return;

    setDraft("");
    setIsLoading(true);

    // Add user message + thinking placeholder in ONE update (avoids race/dup)
    setMessages((m) => [
      ...m,
      { role: "user", content: text },
      { role: "assistant", content: THINKING_TOKEN },
    ]);

    scrollToBottom();

    try {
      const res = await fetch("/api/mr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "general",
          input: text,
          context: "",
          constraints: {},
        }),
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
            ? {
                role: "assistant",
                content: "Something went wrong while analysing.",
              }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
      scrollToBottom();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
  // Enter sends, Shift+Enter = newline
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
          <div className="text-2xl font-semibold tracking-tight">Multirrupt</div>
          <div className="mt-1 text-sm text-neutral-400">
            Narrative engineering for persuasion, clarity, and conversion.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCopyAll}
            disabled={messages.length === 0}
            className={classNames(
              "rounded-xl border px-3 py-2 text-sm",
              messages.length === 0
                ? "cursor-not-allowed border-neutral-800 text-neutral-600"
                : "border-neutral-800 hover:bg-neutral-900"
            )}
            title="Copy entire thread"
          >
            Copy all
          </button>

          <button
            type="button"
            onClick={onClear}
            disabled={messages.length === 0 || isLoading}
            className={classNames(
              "rounded-xl border px-3 py-2 text-sm",
              messages.length === 0 || isLoading
                ? "cursor-not-allowed border-neutral-800 text-neutral-600"
                : "border-neutral-800 hover:bg-neutral-900"
            )}
            title="Clear conversation"
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
          <div className="text-sm text-neutral-400">
            Start by pasting an email, landing page, ad, or just ask a question.
            <div className="mt-2 text-neutral-500">
              Tip: <span className="text-neutral-400">Enter</span> sends,{" "}
              <span className="text-neutral-400">Shift+Enter</span> makes a new line.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m, i) => {
              const isThinking =
                m.role === "assistant" && m.content === THINKING_TOKEN;

              return (
                <div
                  key={i}
                  className={classNames(
                    "group rounded-2xl border px-4 py-3",
                    m.role === "user"
                      ? "border-neutral-800 bg-neutral-900/40"
                      : isThinking
                        ? "border-emerald-900/60 bg-emerald-900/15"
                        : "border-neutral-800 bg-neutral-900/20"
                  )}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs uppercase tracking-widest text-neutral-400">
                      {m.role === "user" ? "You" : "MR"}
                    </div>

                    <button
                      type="button"
                      disabled={isThinking}
                      onClick={() => onCopyMessage(i)}
                      className={classNames(
                        "rounded-lg border px-2 py-1 text-xs",
                        isThinking
                          ? "cursor-not-allowed border-neutral-800 text-neutral-600"
                          : "border-neutral-700 text-neutral-200 hover:bg-neutral-800"
                      )}
                      title={isThinking ? "Can't copy while thinking" : "Copy message"}
                    >
                      Copy
                    </button>
                  </div>

                  <div className="whitespace-pre-wrap leading-relaxed">
                    {isThinking ? (
                      <span className="italic text-emerald-200/80">
                        Thinking…
                      </span>
                    ) : (
                      m.content
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs text-neutral-500">
            {isLoading ? "MR is working…" : "Ready."}
          </div>
          <div className="text-xs text-neutral-600">
            Minimal UI first. Auth + billing come next.
          </div>
        </div>

        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Paste your text here…"
            className="h-[52px] w-full resize-none rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-neutral-600"
          />

          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            className={classNames(
              "h-[52px] shrink-0 rounded-xl px-5 text-sm font-semibold",
              canSend
                ? "bg-neutral-100 text-neutral-950 hover:bg-white"
                : "cursor-not-allowed bg-neutral-800 text-neutral-500"
            )}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  </main>
);
}