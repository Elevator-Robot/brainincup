export const NUMBER_REVEAL_DELAY_MS = 300;
export const NUMBER_REVEAL_FADE_MS = 180;

/** A brief post-click pause, followed by a smooth, restrained reveal. */
export function getDieNumberOpacity(elapsed: number): number {
  const progress = Math.max(0, Math.min(1, (elapsed - NUMBER_REVEAL_DELAY_MS) / NUMBER_REVEAL_FADE_MS));
  return progress * progress * (3 - 2 * progress);
}
