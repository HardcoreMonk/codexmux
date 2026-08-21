export const calculateTimelineSpacerHeight = (
  viewportHeight: number,
  anchorHeight: number,
  postAnchorHeight: number,
  anchorOffset: number,
): number => Math.max(0, viewportHeight - anchorHeight - anchorOffset - Math.max(0, postAnchorHeight));

export const calculateSafeSpacerShrink = (
  currentHeight: number,
  targetHeight: number,
  scrollHeadroom: number,
): number => {
  const current = Math.max(0, currentHeight);
  const target = Math.max(0, targetHeight);
  const headroom = Math.max(0, scrollHeadroom);
  return Math.max(target, current - Math.min(Math.max(0, current - target), headroom));
};
