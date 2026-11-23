import { cn } from "@/utils/cn";

// Selection buttons for the discovery questionnaire: a labelled group of
// toggle buttons (aria-pressed), so each choice is a real button that a
// keyboard or screen reader can reach and that states whether it's selected.

export interface Choice<T extends string> {
  value: T;
  label: string;
}

export function ChoiceButtons<T extends string>({
  labelledBy,
  choices,
  selected,
  onSelect,
  multiple = false,
  disabled,
}: {
  labelledBy: string;
  choices: Choice<T>[];
  /** The selected values (one for a single choice). */
  selected: T[];
  onSelect: (value: T) => void;
  multiple?: boolean;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-labelledby={labelledBy} className="flex flex-wrap gap-1.5" data-multiple={multiple || undefined}>
      {choices.map((c) => {
        const on = selected.includes(c.value);
        return (
          <button
            key={c.value}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onSelect(c.value)}
            className={cn(
              "h-8 rounded-md px-3 text-[13px] ring-1 ring-inset transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-navy-400 disabled:opacity-50",
              on ? "bg-navy-700 text-white ring-navy-700" : "bg-white text-ink-800 ring-ink-200 hover:bg-slatey-50"
            )}
          >
            {multiple && <span aria-hidden="true">{on ? "✓ " : "+ "}</span>}
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
