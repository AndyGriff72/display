/**
 * Pure helpers for moving through a split-flap cell's stack of flaps. Kept apart from the
 * component so the rules can be tested without rendering anything.
 */

/**
 * A stack with its blank flap first, where every cell starts and where anything the stack
 * cannot print ends up. A stack that has lost its blank (boards saved before the server stopped
 * trimming spaces from layouts lost theirs) gets one back, at the front; one with a blank
 * elsewhere has it moved there.
 */
export function normalizeStack(stack: string): string {
  return stack.startsWith(" ") ? stack : " " + stack.replaceAll(" ", "");
}

/**
 * Where `char` sits in the stack. Characters the stack has no flap for fall back to the
 * upper-case flap if there is one (most stacks are upper-case only), then to the first
 * flap, the blank, the same as a real board shows for anything it cannot print.
 */
export function flapIndex(char: string, stack: string): number {
  const exact = stack.indexOf(char);
  if (exact >= 0) return exact;
  const upper = stack.indexOf(char.toUpperCase());
  return upper >= 0 ? upper : 0;
}

/** The flap after `index`. The drum only turns one way, so the last flap comes round to the first. */
export function nextFlap(index: number, stack: string): number {
  return (index + 1) % stack.length;
}

/** How many flips it takes to get from one flap to another, going forward only. */
export function flipsBetween(from: number, to: number, stack: string): number {
  return (to - from + stack.length) % stack.length;
}
