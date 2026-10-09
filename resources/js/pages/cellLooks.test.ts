import { describe, expect, it } from "vitest";
import { CELL_LOOKS, lookById, lookId, lookLabel } from "./cellLooks";
import { CELL_TYPES } from "../board/layout";

describe("the list of cell looks", () => {
  it("offers every cell type, and VFD and lightbulbs as entries of their own", () => {
    for (const type of CELL_TYPES) expect(CELL_LOOKS.some((l) => l.type === type)).toBe(true);
    expect(lookLabel("dotmatrix", "vfd")).toBe("Dot matrix (VFD)");
    expect(lookLabel("dotmatrix", "bulb")).toBe("Dot matrix (lightbulbs)");
    expect(lookLabel("segment", "vfd")).toBe("VFD segments");
  });

  it("treats LED and no finish as the same entry, both ways", () => {
    expect(lookId("dotmatrix")).toBe("dotmatrix");
    expect(lookId("dotmatrix", "led")).toBe("dotmatrix");
    expect(lookById("dotmatrix-bulb")).toMatchObject({ type: "dotmatrix", finish: "bulb" });
    expect(lookById("flipdot")?.finish).toBeUndefined();
  });
});
