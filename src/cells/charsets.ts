/**
 * Flap stacks, in drum order. A split-flap cell can only show what is printed on its
 * flaps, and can only reach a character by flipping forward through every flap before it,
 * so the order here is the order the viewer sees the characters go past.
 *
 * The first character is the cell's resting state, so keep it a blank.
 */
export const CHARSETS = {
  /** Letters, digits and the punctuation a departures board needs. */
  standard: " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:-/'()&!?",
  /** Clocks and platform numbers: a short drum, so it settles fast. */
  numeric: " 0123456789:.-",
  /** Letters only. */
  alpha: " ABCDEFGHIJKLMNOPQRSTUVWXYZ",
} as const;

export type CharsetName = keyof typeof CHARSETS;
