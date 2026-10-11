import { TEXT_STYLES, type TextStyle } from "../../board/layout";

const BUTTONS: Record<(typeof TEXT_STYLES)[number], { label: string; title: string }> = {
  bold: { label: "B", title: "Bold" },
  italic: { label: "I", title: "Italic" },
  underline: { label: "U", title: "Underline" },
};

/**
 * Bold, italic and underline, as three buttons that stay pressed while on.
 *
 * An area can inherit a style (a field on a text board takes the board's), so a press stores
 * only a difference from what it inherits: turning bold off where the board is bold stores
 * false, and turning it back on removes the setting again.
 */
export function TextStyleButtons({
  value,
  inherited = {},
  onChange,
}: {
  value: TextStyle;
  inherited?: TextStyle;
  onChange: (patch: TextStyle) => void;
}) {
  return (
    <span className="text-style-buttons" role="group" aria-label="Text style">
      {TEXT_STYLES.map((k) => {
        const on = value[k] ?? inherited[k] ?? false;
        const next = !on;
        return (
          <button
            key={k}
            type="button"
            className={`text-style-${k}`}
            title={BUTTONS[k].title}
            aria-label={BUTTONS[k].title}
            aria-pressed={on}
            onClick={() => onChange({ [k]: next === (inherited[k] ?? false) ? undefined : next })}
          >
            {BUTTONS[k].label}
          </button>
        );
      })}
    </span>
  );
}
