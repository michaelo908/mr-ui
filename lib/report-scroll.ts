export type ReportScrollGeometry = {
  currentScrollTop: number;
  scrollerTop: number;
  targetTop: number;
  viewportHeight: number;
};

export function calculateEditorSummaryScrollTop({
  currentScrollTop,
  scrollerTop,
  targetTop,
  viewportHeight,
}: ReportScrollGeometry) {
  const preferredBrowserOffset = viewportHeight * 0.12;
  const availableInset = preferredBrowserOffset - scrollerTop;
  const comfortableInset = Math.max(20, availableInset);

  return Math.max(
    0,
    currentScrollTop + targetTop - scrollerTop - comfortableInset
  );
}
