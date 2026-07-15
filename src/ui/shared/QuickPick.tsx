import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { cx } from "./primitives";

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
  const [activeIndex, setActiveIndex] = useState(0);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
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

    setActiveIndex(0);
    setQuery("");
    inputRef.current?.focus();
  }, [open]);

  if (!open) {
    return null;
  }

  const selectActiveOption = () => {
    const option = visibleOptions[activeIndex];

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
        return 0;
      }

      return event.key === "ArrowDown"
        ? (current + 1) % visibleOptions.length
        : (current - 1 + visibleOptions.length) % visibleOptions.length;
    });
  };

  return (
    <div
      className="ui-overlay-backdrop ui-quick-pick-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        aria-label={ariaLabel}
        aria-modal="true"
        className="ui-quick-pick"
        role="dialog"
        onKeyDown={handleKeyDown}
      >
        <input
          aria-label={ariaLabel}
          className="ui-input"
          placeholder={placeholder}
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setActiveIndex(0);
            setQuery(event.target.value);
          }}
        />
        <div className="ui-quick-pick-options" role="listbox">
          {visibleOptions.length > 0 ? (
            visibleOptions.map((option, index) => (
              <button
                aria-selected={index === activeIndex}
                className={cx(
                  "ui-quick-pick-option",
                  index === activeIndex && "is-active",
                )}
                disabled={option.disabled}
                key={option.id}
                onClick={() => onSelect(option)}
                onPointerMove={() => setActiveIndex(index)}
                role="option"
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
      </div>
    </div>
  );
}
