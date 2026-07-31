"use client";

import {
  actionEmoji,
  buildRecommendationLightboxContext,
  buildRecommendationViewportLaunch,
  extractViewportNumbersFromTokens,
  getViewportImageByNumber,
  parseViewportReferenceTokens,
  type NarrativePerformance,
  type NarrativePerformanceRecommendation,
  type NarrativePerformanceViewportLaunch,
} from "@/lib/narrative-performance";
import type { SourceImage } from "@/lib/sources";

function renderViewportReferences(
  value: string,
  images: SourceImage[],
  onOpenViewport: (viewportNumber: number) => void,
  recommendation: NarrativePerformanceRecommendation | null = null,
  onOpenRecommendation?: (
    launch: NarrativePerformanceViewportLaunch
  ) => void
) {
  const tokens = parseViewportReferenceTokens(value);
  const canonicalViewportNumbers = extractViewportNumbersFromTokens(tokens);

  return tokens.map((token, index) => {
    if (token.type === "text") {
      return <span key={`text-${index}`}>{token.text}</span>;
    }

    const validViewportNumbers = token.viewportNumbers.filter(
      (viewportNumber) =>
        canonicalViewportNumbers.includes(viewportNumber) &&
        getViewportImageByNumber(images, viewportNumber) !== null
    );
    const startingViewport = validViewportNumbers[0];
    const launch =
      recommendation && startingViewport !== undefined
        ? buildRecommendationViewportLaunch(
            recommendation,
            images,
            startingViewport
          )
        : null;

    if (startingViewport === undefined) {
      return <span key={`reference-${index}`}>{token.text}</span>;
    }

    return (
      <button
        key={`reference-${index}`}
        type="button"
        onClick={() => {
          if (launch && onOpenRecommendation) {
            onOpenRecommendation(launch);
          } else {
            onOpenViewport(startingViewport);
          }
        }}
        className="font-semibold text-[#C6A75A] underline decoration-[#C6A75A]/60 underline-offset-4 hover:text-amber-200"
        aria-label={
          validViewportNumbers.length === 1
            ? `Open viewport ${startingViewport}`
            : `Open viewports ${validViewportNumbers.join(", ")} starting at viewport ${startingViewport}`
        }
      >
        {token.text}
      </button>
    );
  });
}

export default function NarrativePerformancePanel({
  performance,
  images,
  onOpenViewport,
  onOpenRecommendation,
}: {
  performance: NarrativePerformance;
  images: SourceImage[];
  onOpenViewport: (viewportNumber: number) => void;
  onOpenRecommendation: (
    launch: NarrativePerformanceViewportLaunch
  ) => void;
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
          {performance.recommendations.map((recommendation, index) => {
            const context = buildRecommendationLightboxContext(
              recommendation,
              images
            );
            const firstViewport = context.viewportNumbers[0];
            const bulletLaunch =
              firstViewport === undefined
                ? null
                : buildRecommendationViewportLaunch(
                    recommendation,
                    images,
                    firstViewport
                  );
            return (
              <div
                key={`${recommendation.action}-${index}`}
                className="border-t border-neutral-800 pt-3 first:border-t-0 first:pt-0"
              >
                <p className="text-sm leading-6 text-neutral-200">
                  <button
                    type="button"
                    disabled={!bulletLaunch}
                    onClick={() => {
                      if (bulletLaunch) onOpenRecommendation(bulletLaunch);
                    }}
                    className="rounded font-semibold underline-offset-4 hover:underline disabled:cursor-default disabled:no-underline"
                    style={{ color: context.color }}
                    aria-label={
                      bulletLaunch
                        ? `Open ${recommendation.action} recommendation evidence`
                        : undefined
                    }
                  >
                    {actionEmoji(recommendation.action)} {recommendation.action}
                  </button>
                  <span aria-hidden="true"> — </span>
                  {renderViewportReferences(
                    recommendation.body,
                    images,
                    onOpenViewport,
                    recommendation,
                    onOpenRecommendation
                  )}
                </p>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
