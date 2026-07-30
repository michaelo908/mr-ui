"use client";

import type { ReactNode } from "react";
import {
  actionEmoji,
  getViewportImageByNumber,
  type NarrativePerformance,
} from "@/lib/narrative-performance";
import type { SourceImage } from "@/lib/sources";

function renderViewportReferences(
  value: string,
  images: SourceImage[],
  onOpenViewport: (viewportNumber: number) => void
) {
  const parts: ReactNode[] = [];
  const pattern = /\b(Viewports?)\s+(\d+(?:\s*(?:,|and|&)\s*\d+)*)/gi;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    parts.push(value.slice(cursor, match.index));
    parts.push(<span key={`label-${match.index}`}>{match[1]} </span>);

    const numberPattern = /\d+/g;
    let numberCursor = 0;
    let numberMatch: RegExpExecArray | null;
    while ((numberMatch = numberPattern.exec(match[2])) !== null) {
      parts.push(
        <span key={`separator-${match.index}-${numberMatch.index}`}>
          {match[2].slice(numberCursor, numberMatch.index)}
        </span>
      );
      const viewportNumber = Number(numberMatch[0]);
      const image = getViewportImageByNumber(images, viewportNumber);
      parts.push(
        image ? (
          <button
            key={`viewport-${match.index}-${viewportNumber}`}
            type="button"
            onClick={() => onOpenViewport(viewportNumber)}
            className="font-semibold text-[#C6A75A] underline decoration-[#C6A75A]/60 underline-offset-4 hover:text-amber-200"
            aria-label={`Open viewport ${viewportNumber}`}
          >
            {viewportNumber}
          </button>
        ) : (
          <span key={`viewport-${match.index}-${viewportNumber}`}>
            {viewportNumber}
          </span>
        )
      );
      numberCursor = numberMatch.index + numberMatch[0].length;
    }
    parts.push(
      <span key={`tail-${match.index}`}>{match[2].slice(numberCursor)}</span>
    );
    cursor = match.index + match[0].length;
  }

  parts.push(value.slice(cursor));
  return parts;
}

export default function NarrativePerformancePanel({
  performance,
  images,
  onOpenViewport,
}: {
  performance: NarrativePerformance;
  images: SourceImage[];
  onOpenViewport: (viewportNumber: number) => void;
}) {
  return (
    <section
      data-narrative-performance="true"
      className="rounded-2xl border border-[#C6A75A]/35 bg-[#C6A75A]/[0.05] px-4 py-5 sm:px-5"
    >
      <h2 className="text-[20px] font-semibold tracking-tight text-[#C6A75A]">
        Narrative Performance
      </h2>

      {performance.observations.length > 0 ? (
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {performance.observations.map((observation) => (
            <div
              key={observation.label}
              className="rounded-xl border border-neutral-800 bg-neutral-950/55 px-3 py-3"
            >
              <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                {observation.label}
              </dt>
              <dd className="mt-1.5 text-sm leading-6 text-neutral-200">
                {renderViewportReferences(
                  observation.value,
                  images,
                  onOpenViewport
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {performance.recommendations.length > 0 ? (
        <div className="mt-5 space-y-3">
          {performance.recommendations.map((recommendation, index) => (
            <div
              key={`${recommendation.action}-${index}`}
              className="border-t border-neutral-800 pt-3 first:border-t-0 first:pt-0"
            >
              <p className="text-sm leading-6 text-neutral-200">
                <span className="font-semibold text-neutral-100">
                  {actionEmoji(recommendation.action)} {recommendation.action}
                </span>
                <span aria-hidden="true"> — </span>
                {renderViewportReferences(
                  recommendation.body,
                  images,
                  onOpenViewport
                )}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
