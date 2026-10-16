/**
 * Getting back to the board being edited, and not losing it by accident.
 *
 * The "Boards" link returns to the board last open in this browser tab rather than starting a
 * new one; and while the editor has unsaved changes, the app's own links ask before leaving it
 * (closing or reloading the tab is covered by the browser's own warning).
 */

const LAST_BOARD_KEY = "display.lastBoard";

/** Where the "Boards" link goes: the board last open in this tab, or a new board. */
export function lastBoardPath(): string {
  try {
    const path = sessionStorage.getItem(LAST_BOARD_KEY);
    return path && /^\/boards\/\d+$/.test(path) ? path : "/";
  } catch {
    return "/";
  }
}

/** Remember the board the editor shows; undefined for a new board. */
export function rememberBoard(id: number | undefined): void {
  try {
    if (id === undefined) sessionStorage.removeItem(LAST_BOARD_KEY);
    else sessionStorage.setItem(LAST_BOARD_KEY, `/boards/${id}`);
  } catch {
    // Storage can be blocked; the link then starts a new board, as it used to.
  }
}

let hasUnsavedChanges: () => boolean = () => false;

/** The editor says how to tell whether it has unsaved changes; null when it closes. */
export function setUnsavedChangesCheck(check: (() => boolean) | null): void {
  hasUnsavedChanges = check ?? (() => false);
}

/** Before following a link away from the editor: true to go, after asking if there is anything unsaved. */
export function confirmLeavingEditor(): boolean {
  return !hasUnsavedChanges() || window.confirm("Leave this board without saving your changes?");
}
