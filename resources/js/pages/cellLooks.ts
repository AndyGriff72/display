import type { CellType, Finish } from "../board/layout";

/**
 * Every kind of cell a board or area can be drawn with, as one list: a cell type, and for dot
 * matrix and segments a finish. Finishes look like different displays to the person choosing
 * (a VFD is not "a dot matrix with a setting"), so they are offered as entries of their own
 * rather than as a separate choice that only appears once the right type is picked.
 */
export interface CellLook {
  id: string;
  label: string;
  type: CellType;
  finish?: Finish;
}

export const CELL_LOOKS: CellLook[] = [
  { id: "splitflap", label: "Split-flap", type: "splitflap" },
  { id: "dotmatrix", label: "Dot matrix (LED)", type: "dotmatrix" },
  { id: "dotmatrix-vfd", label: "Dot matrix (VFD)", type: "dotmatrix", finish: "vfd" },
  { id: "dotmatrix-bulb", label: "Dot matrix (lightbulbs)", type: "dotmatrix", finish: "bulb" },
  { id: "segment", label: "LED segments", type: "segment" },
  { id: "segment-vfd", label: "VFD segments", type: "segment", finish: "vfd" },
  { id: "flipdot", label: "Flip-dot", type: "flipdot" },
];

/** The list entry for a type and finish; LED is the same as no finish. */
export function lookId(type: CellType, finish?: Finish): string {
  const match = CELL_LOOKS.find((l) => l.type === type && (l.finish ?? "led") === (finish ?? "led"));
  return match?.id ?? type;
}

export function lookById(id: string): CellLook | undefined {
  return CELL_LOOKS.find((l) => l.id === id);
}

export function lookLabel(type: CellType, finish?: Finish): string {
  return lookById(lookId(type, finish))?.label ?? type;
}
