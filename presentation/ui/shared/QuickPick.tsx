import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Overlay } from "./Overlay";
import { cx } from "./primitives";
import { InputControl } from "./controls";

export type QuickPickOption = {
  description?: string;
  disabled?: boolean;
  id: string;
  label: string;
};

export function QuickPick({
  ariaLabel,
  emptyMessage = "没有匹配项",
  open,
  options,
  placeholder = "筛选",
  onClose,
  onSelect,
}: {
  ariaLabel: string;
  emptyMessage?: string;
  open: boolean;
  options: QuickPickOption[];
  placeholder?: string;
  onClose: () => void;
  onSelect: (option: QuickPickOption) => void;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();
  const visibleOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    return normalizedQuery
      ? options.filter((option) =>
          `${option.label} ${option.description ?? ""}`
            .toLocaleLowerCase()
            .includes(normalizedQuery),
        )
      : options;
  }, [options, query]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveIndex(null);
    setQuery("");
    inputRef.current?.focus();
  }, [open]);

  if (!open) {
    return null;
  }

  const selectActiveOption = () => {
    const option = activeIndex === null ? undefined : visibleOptions[activeIndex];

    if (option && !option.disabled) {
      onSelect(option);
    }
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      selectActiveOption();
      return;
    }

    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    event.preventDefault();
    setActiveIndex((current) => {
      if (visibleOptions.length === 0) {
        return null;
      }

      const direction = event.key === "ArrowDown" ? 1 : -1;
      let next = current === null
        ? direction > 0 ? 0 : visibleOptions.length - 1
        : (current + direction + visibleOptions.length) % visibleOptions.length;

      for (let visited = 0; visited < visibleOptions.length; visited += 1) {
        if (!visibleOptions[next]?.disabled) {
          return next;
        }

        next = (next + direction + visibleOptions.length) % visibleOptions.length;
      }

      return null;
    });
  };
  const activeOption =
    activeIndex === null ? undefined : visibleOptions[activeIndex];
  const activeDescendant = activeOption && activeIndex !== null
    ? `${listboxId}-option-${activeIndex}`
    : undefined;

  return (
    <Overlay
      ariaLabel={ariaLabel}
      backdropClassName="ui-overlay-backdrop ui-quick-pick-backdrop"
      className="ui-quick-pick"
      initialFocusRef={inputRef}
      modal
      role="dialog"
      trapFocus
      onDismiss={onClose}
      onKeyDown={handleKeyDown}
    >
      <InputControl
        aria-activedescendant={activeDescendant}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded="true"
        aria-label={ariaLabel}
        placeholder={placeholder}
        ref={inputRef}
        role="combobox"
        sizing="container"
        value={query}
        onChange={(event) => {
          setActiveIndex(null);
          setQuery(event.target.value);
        }}
      />
      <div className="ui-quick-pick-options" id={listboxId} role="listbox">
          {visibleOptions.length > 0 ? (
            visibleOptions.map((option, index) => (
              <button
                aria-selected={index === activeIndex}
                className={cx(
                  "ui-quick-pick-option",
                  index === activeIndex && "is-active",
                )}
                disabled={option.disabled}
                id={`${listboxId}-option-${index}`}
                key={option.id}
                onClick={() => onSelect(option)}
                onPointerMove={() => setActiveIndex(index)}
                role="option"
                tabIndex={-1}
                type="button"
              >
                <span>{option.label}</span>
                {option.description ? <small>{option.description}</small> : null}
              </button>
            ))
          ) : (
            <p className="ui-quick-pick-empty">{emptyMessage}</p>
          )}
      </div>
    </Overlay>
  );
}
