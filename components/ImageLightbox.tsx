"use client";

import { useEffect, useRef } from "react";
import type { SourceImage } from "@/lib/sources";

export default function ImageLightbox({
  images,
  activeIndex,
  onChange,
  onClose,
}: {
  images: SourceImage[];
  activeIndex: number | null;
  onChange: (index: number) => void;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const activeImage =
    activeIndex === null ? null : images[activeIndex] ?? null;

  useEffect(() => {
    if (!activeImage || activeIndex === null) return;

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
        onChange((activeIndex - 1 + images.length) % images.length);
      } else if (event.key === "ArrowRight" && images.length > 1) {
        event.preventDefault();
        onChange((activeIndex + 1) % images.length);
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
  }, [activeImage, activeIndex, images.length, onChange, onClose]);

  if (!activeImage || activeIndex === null) return null;

  const isViewport = activeImage.role === "viewport";
  const label = isViewport
    ? `Viewport ${activeIndex + 1} of ${images.length}`
    : images.length === 1
      ? activeImage.title
      : `Image ${activeIndex + 1} of ${images.length}`;

  return (
    <div
      data-image-lightbox="true"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-[100] flex bg-black/90 p-3 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative mx-auto flex min-h-0 w-full max-w-7xl flex-col">
        <div className="mb-3 flex shrink-0 items-center justify-between gap-4 text-neutral-100">
          <div className="text-sm font-semibold">{label}</div>
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

        <div className="relative min-h-0 flex-1 overflow-auto rounded-xl">
          <div className="flex min-h-full min-w-full items-start justify-center">
            <img
              src={activeImage.dataUrl}
              alt={activeImage.altText || activeImage.title || label}
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
