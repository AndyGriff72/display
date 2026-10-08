import { describe, expect, it } from "vitest";
import { bindFields, formatValue, parseTemplate, renderTemplate, templateColumns } from "./binding";

const row = {
  departs_at: "2026-10-08 14:32:00",
  destination: "LONDON EUSTON",
  platform: "4",
  delay: 5,
  notes: null,
};

describe("templates", () => {
  it("replaces columns and keeps the text around them", () => {
    expect(renderTemplate("PLATFORM {platform}", row)).toBe("PLATFORM 4");
    expect(renderTemplate("{destination}", row)).toBe("LONDON EUSTON");
    expect(renderTemplate("{delay} MIN LATE", row)).toBe("5 MIN LATE");
  });

  it("formats a column after a bar", () => {
    expect(renderTemplate("{departs_at|HH:mm}", row)).toBe("14:32");
    expect(renderTemplate("{ departs_at | h:mm a }", row)).toBe("2:32 pm");
  });

  it("shows nothing for an empty value, a missing column or a missing row", () => {
    expect(renderTemplate("{notes}", row)).toBe("");
    expect(renderTemplate("[{fare}]", row)).toBe("[]");
    expect(renderTemplate("PLATFORM {platform}", undefined)).toBe("PLATFORM ");
  });

  it("leaves a lone brace alone", () => {
    expect(renderTemplate("A { B", row)).toBe("A { B");
    expect(parseTemplate("{}")).toEqual([{ literal: "{}" }]);
  });

  it("lists the columns a template uses", () => {
    expect(templateColumns("{departs_at|HH:mm} {destination}")).toEqual(["departs_at", "destination"]);
  });
});

describe("date and time formats", () => {
  const at = "2026-10-08 09:05:07";

  it("formats the parts of a date and time", () => {
    expect(formatValue(at, "YYYY-MM-DD HH:mm:ss")).toBe(at);
    expect(formatValue(at, "D/M/YY H:mm")).toBe("8/10/26 9:05");
    expect(formatValue(at, "ddd D MMM")).toBe("Thu 8 Oct");
    expect(formatValue(at, "dddd D MMMM YYYY")).toBe("Thursday 8 October 2026");
    expect(formatValue(at, "hh:mm A")).toBe("09:05 AM");
    expect(formatValue("2026-10-08 00:15:00", "h:mm a")).toBe("12:15 am");
    expect(formatValue("2026-10-08 12:00:00", "h a")).toBe("12 pm");
  });

  it("keeps text in square brackets as it is", () => {
    expect(formatValue(at, "[DUE] HH:mm")).toBe("DUE 09:05");
  });

  it("reads ISO date-times, plain dates and plain times", () => {
    expect(formatValue("2026-10-08T14:32:00+01:00", "HH:mm")).toBe("14:32");
    expect(formatValue("2026-10-08", "D MMM")).toBe("8 Oct");
    expect(formatValue("14:32:00", "HH:mm")).toBe("14:32");
    expect(formatValue("7:05", "HH:mm")).toBe("07:05");
  });

  it("does not shift the time to the browser's time zone", () => {
    // A value with an offset is still shown as written, not converted.
    expect(formatValue("2026-10-08T23:30:00Z", "HH:mm")).toBe("23:30");
  });

  it("shows anything that is not a date or time as it is", () => {
    expect(formatValue("ON TIME", "HH:mm")).toBe("ON TIME");
    expect(formatValue(42, "HH:mm")).toBe("42");
  });
});

describe("bindFields", () => {
  const rows = [row, { ...row, destination: "MANCHESTER", platform: "11" }];

  it("fills each bound field from its row, defaulting to the first", () => {
    expect(
      bindFields(
        [
          { id: "dest", text: "{destination}" },
          { id: "next", text: "{destination}", row: 1 },
          { id: "third", text: "{destination}", row: 2 },
          { id: "typed" },
        ],
        rows
      )
    ).toEqual({ dest: "LONDON EUSTON", next: "MANCHESTER", third: "" });
  });
});
