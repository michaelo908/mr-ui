"use client";

import { useEffect, useRef } from "react";
import {
  getViewportImageByNumber,
  type NarrativePerformanceLightboxContext,
} from "@/lib/narrative-performance";
import type { SourceImage } from "@/lib/sources";

export default function ImageLightbox({
  images,
  activeIndex,
  context = null,
  onChange,
  onClose,
}: {
  images: SourceImage[];
  activeIndex: number | null;
  context?: NarrativePerformanceLightboxContext | null;
  onChange: (index: number) => void;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const activeIndexRef = useRef(activeIndex);
  const activeImage =
    activeIndex === null ? null : images[activeIndex] ?? null;
  const isOpen = activeImage !== null;

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowLeft" && images.length > 1) {
        event.preventDefault();
        const current = activeIndexRef.current ?? 0;
        onChange((current - 1 + images.length) % images.length);
      } else if (event.key === "ArrowRight" && images.length > 1) {
        event.preventDefault();
        const current = activeIndexRef.current ?? 0;
        onChange((current + 1) % images.length);
      } else if (event.key === "Tab") {
        const dialog = document.querySelector<HTMLElement>(
          '[data-image-lightbox="true"]'
        );
        const focusable = dialog
          ? Array.from(
              dialog.querySelectorAll<HTMLElement>(
                'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
              )
            )
          : [];
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [images.length, isOpen, onChange, onClose]);

  if (!activeImage || activeIndex === null) return null;

  const isViewport = activeImage.role === "viewport";
  const positionLabel = isViewport
    ? `${activeIndex + 1} of ${images.length}`
    : images.length === 1
      ? activeImage.title
      : `${activeIndex + 1} of ${images.length}`;
  const viewportLabel = isViewport
    ? `VIEWPORT ${activeIndex + 1}`
    : activeImage.title;
  const title = context && isViewport
    ? `${context.emoji} ${context.action.toUpperCase()} — ${viewportLabel}`
    : viewportLabel;
  const dialogLabel = isViewport
    ? `${title}, ${positionLabel}`
    : `${title}, image ${positionLabel}`;

  return (
    <div
      data-image-lightbox="true"
      role="dialog"
      aria-modal="true"
      aria-label={dialogLabel}
      className="fixed inset-0 z-[100] flex bg-black/90 p-2 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative mx-auto flex min-h-0 w-full max-w-7xl flex-col overflow-hidden rounded-xl">
        <header className="sticky top-0 z-20 shrink-0 border-b border-neutral-700 bg-neutral-950/95 px-3 py-3 text-neutral-100 shadow-lg backdrop-blur sm:px-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2
                  className="text-sm font-bold tracking-wide text-white sm:text-base"
                  style={
                    context && isViewport ? { color: context.color } : undefined
                  }
                >
                  {title}
                </h2>
                <span className="text-xs font-semibold text-neutral-400">
                  {positionLabel}
                </span>
              </div>

              {context && isViewport ? (
                <>
                  <p className="mt-2 max-w-4xl text-xs leading-5 text-neutral-300 sm:text-sm">
                    {context.recommendation}
                  </p>
                  {context.viewportNumbers.length > 0 ? (
                    <nav
                      className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-neutral-400"
                      aria-label="Recommendation evidence viewports"
                    >
                      <span className="mr-1 font-semibold">Evidence:</span>
                      {context.viewportNumbers.map((viewportNumber, index) => {
                        const evidenceImage = getViewportImageByNumber(
                          images,
                          viewportNumber
                        );
                        const evidenceIndex = evidenceImage
                          ? images.findIndex(
                              (image) => image.id === evidenceImage.id
                            )
                          : -1;
                        const isCurrent = evidenceIndex === activeIndex;
                        return (
                          <span
                            key={viewportNumber}
                            className="inline-flex items-center gap-1.5"
                          >
                            {index > 0 ? (
                              <span aria-hidden="true" className="text-neutral-600">
                                ·
                              </span>
                            ) : null}
                            <button
                              type="button"
                              disabled={evidenceIndex < 0}
                              onClick={() => onChange(evidenceIndex)}
                              aria-label={`Show evidence viewport ${viewportNumber}`}
                              aria-current={isCurrent ? "true" : undefined}
                              className={
                                isCurrent
                                  ? "rounded px-1.5 py-0.5 font-bold ring-1"
                                  : "rounded px-1.5 py-0.5 font-semibold text-neutral-200 hover:bg-neutral-800 hover:text-white disabled:text-neutral-600"
                              }
                              style={
                                isCurrent && context
                                  ? {
                                      color: context.color,
                                      boxShadow: `0 0 0 1px ${context.color}`,
                                    }
                                  : undefined
                              }
                            >
                              {viewportNumber}
                            </button>
                          </span>
                        );
                      })}
                    </nav>
                  ) : null}
                </>
              ) : null}
            </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close image viewer"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-neutral-600 bg-neutral-950/80 text-xl hover:bg-neutral-800"
          >
            ×
          </button>
          </div>
        </header>

        <div className="relative min-h-0 flex-1 overflow-auto bg-neutral-950 pt-3">
          <div className="flex min-h-full min-w-full items-start justify-center">
            <img
              src={activeImage.dataUrl}
              alt={activeImage.altText || activeImage.title || dialogLabel}
              className="h-auto max-w-none rounded-lg object-contain shadow-2xl"
              style={{
                width: "min(100%, 1440px)",
                minWidth: "min(100%, 960px)",
              }}
            />
          </div>
        </div>

        {images.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() =>
                onChange((activeIndex - 1 + images.length) % images.length)
              }
              aria-label={`Previous ${isViewport ? "viewport" : "image"}`}
              className="absolute left-2 top-1/2 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-600 bg-neutral-950/85 text-2xl text-white shadow-lg hover:bg-neutral-800 sm:left-4"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => onChange((activeIndex + 1) % images.length)}
              aria-label={`Next ${isViewport ? "viewport" : "image"}`}
              className="absolute right-2 top-1/2 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-600 bg-neutral-950/85 text-2xl text-white shadow-lg hover:bg-neutral-800 sm:right-4"
            >
              ›
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
