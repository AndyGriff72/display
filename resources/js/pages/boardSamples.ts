import type { Row } from "../board/binding";
import type { BoardLayout } from "../board/layout";

/** A layout's structure: everything but the cell appearance, which the editor's controls set. */
export type LayoutShape = Omit<BoardLayout, "cell">;

export interface Sample {
  id: string;
  label: string;
  layout: LayoutShape;
  cellWidth: number;
  cellHeight: number;
}

/**
 * Records shaped like the sample departures table (database/samples/departures.mysql.sql), so
 * the samples show something before any database is connected.
 */
export const SAMPLE_RECORDS: Row[] = [
  { departs_at: "2026-10-08 14:32:00", destination: "LONDON EUSTON", calling_at: "CREWE, STAFFORD, MILTON KEYNES", platform: "4", status: "ON TIME" },
  { departs_at: "2026-10-08 14:47:00", destination: "MANCHESTER", calling_at: "WARRINGTON BANK QUAY", platform: "11", status: "DELAYED" },
  { departs_at: "2026-10-08 15:05:00", destination: "EDINBURGH", calling_at: "CARLISLE, LOCKERBIE", platform: "2", status: "ON TIME" },
  { departs_at: "2026-10-08 15:20:00", destination: "GLASGOW CENTRAL", calling_at: "PRESTON, LANCASTER, OXENHOLME, PENRITH", platform: "9", status: "CANCELLED" },
  { departs_at: "2026-10-08 15:34:00", destination: "BIRMINGHAM", calling_at: "STAFFORD, WOLVERHAMPTON", platform: "1", status: "ON TIME" },
  { departs_at: "2026-10-08 15:48:00", destination: "LIVERPOOL", calling_at: "RUNCORN", platform: "6", status: "ON TIME" },
  { departs_at: "2026-10-08 16:02:00", destination: "HOLYHEAD", calling_at: "CHESTER, BANGOR", platform: "3", status: "DELAYED" },
];

export const SAMPLES: Sample[] = [
  {
    id: "mixed",
    label: "Mixed cell types",
    cellWidth: 24,
    cellHeight: 38,
    layout: {
      columns: 38,
      rows: 7,
      pageSeconds: 8,
      fields: [
        { id: "title", area: "0,0 to 20,0", text: "DEPARTURES" },
        {
          id: "note",
          area: "22,0 to 37,0",
          align: "right",
          text: "Live from the timetable",
          cell: { type: "text", color: "#9aa3ad", fontSize: 18, fontFamily: '"Inter", sans-serif' },
        },
      ],
      lists: [
        {
          id: "departures",
          area: "0,1 to 37,6",
          header: true,
          columns: [
            { title: "TIME", text: "{departs_at|HH:mm}", width: 5, cell: { type: "dotmatrix" } },
            { title: "DESTINATION", text: "{destination}", width: 15 },
            { title: "PLAT", text: "{platform}", width: 4, align: "right", cell: { type: "segment", segments: 7 } },
            { title: "Calling at", text: "{calling_at}", cell: { type: "text", fontSize: 17, fontFamily: '"Inter", sans-serif' } },
          ],
        },
      ],
    },
  },
  {
    id: "table",
    label: "Departures table",
    cellWidth: 26,
    cellHeight: 40,
    layout: {
      columns: 36,
      rows: 6,
      pageSeconds: 8,
      lists: [
        {
          id: "departures",
          area: "0,0 to 35,5",
          header: true,
          columns: [
            { title: "TIME", text: "{departs_at|HH:mm}", width: 5 },
            { title: "DESTINATION", text: "{destination}", width: 15 },
            { title: "PLAT", text: "{platform}", width: 4, align: "right" },
            { title: "STATUS", text: "{status}" },
          ],
        },
      ],
    },
  },
  {
    id: "single",
    label: "One departure per page",
    cellWidth: 32,
    cellHeight: 50,
    layout: {
      columns: 24,
      rows: 4,
      pageSeconds: 8,
      pageFields: true,
      statics: [{ id: "logo", area: "0,0 to 3,3", image: "/sample-logo.svg", padding: 16, background: "#1f3a6b" }],
      fields: [
        { id: "time", area: "4,0 to 8,0", text: "{departs_at|HH:mm}" },
        { id: "destination", area: "10,0 to 23,0", text: "{destination}" },
        { id: "calling", area: "4,1 to 23,2", text: "{calling_at}" },
        { id: "platform", area: "4,3 to 14,3", text: "PLATFORM {platform}" },
        { id: "status", area: "15,3 to 23,3", align: "right", text: "{status}" },
      ],
    },
  },
];
