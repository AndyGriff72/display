import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { recentChanges, subscribeBeatTiming, type ChangeTiming } from "../cells/splitflap/beatTiming";
import "./TimingReadout.css";

/**
 * A corner readout of how the split-flaps kept time in the last few changes, for finding out
 * on the machine itself where a board falls behind. Shown when the address has ?timing in it.
 *
 * Drawn on the page itself (a portal), not inside the board, so a screen's scaling of the board
 * does not shrink or move it.
 */
export function TimingReadout() {
  // A new array each time, so the store's snapshot changes whenever a change does.
  const changes = useSyncExternalStore(subscribeBeatTiming, snapshot);
  return createPortal(
    <div className="timing-readout" aria-live="off">
      <div className="timing-title">Split-flap timing (beats should be {changes[0]?.periodMs ?? 80} ms apart)</div>
      {changes.length === 0 && <div>Waiting for a change…</div>}
      {changes.map((c) => (
        <Change key={c.startedAt} c={c} />
      ))}
    </div>,
    document.body
  );
}

let cached: { version: number; value: ChangeTiming[] } = { version: -1, value: [] };
let version = 0;
subscribeBeatTiming(() => version++);
function snapshot(): ChangeTiming[] {
  if (cached.version !== version) cached = { version, value: recentChanges().map((c) => ({ ...c })) };
  return cached.value;
}

function Change({ c }: { c: ChangeTiming }) {
  const ms = (n: number) => `${Math.round(n)} ms`;
  const fine = (n: number) => `${n.toFixed(1)} ms`;
  const time = new Date(c.startedAt).toLocaleTimeString();
  return (
    <div className={`timing-change${c.running ? " timing-running" : ""}`}>
      <div>
        <strong>{time}</strong> {c.running ? "running" : `${c.beats} beats`}
      </div>
      <div>
        start: first beat {ms(c.firstLateMs)} late · first 12 beats lost <strong>{ms(c.lostMs)}</strong>
      </div>
      <div>
        longest gap between beats {ms(c.longestGapMs)} · between frames {ms(c.longestFrameMs)}
      </div>
      <div>
        per beat: tiles {fine(c.stepMs)} (most {fine(c.stepMaxMs)}) · sound {fine(c.soundMs)} (most {fine(c.soundMaxMs)})
      </div>
    </div>
  );
}
