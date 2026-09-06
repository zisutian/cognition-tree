// SPDX-License-Identifier: GPL-3.0-or-later

import {
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cx } from "./primitives.tsx";

export type SubsectionTab<Value extends string> = Readonly<{
  label: ReactNode;
  value: Value;
}>;

export function getSubsectionTabTargetIndex(
  currentIndex: number,
  key: string,
  optionCount: number,
) {
  if (optionCount <= 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return optionCount - 1;
  if (key === "ArrowLeft") {
    return (currentIndex - 1 + optionCount) % optionCount;
  }
  if (key === "ArrowRight") {
    return (currentIndex + 1) % optionCount;
  }
  return null;
}

export function SubsectionTabs<Value extends string>({
  ariaLabel,
  children,
  className,
  onChange,
  options,
  value,
}: {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  onChange(value: Value): void;
  options: readonly SubsectionTab<Value>[];
  value: Value;
}) {
  const id = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const panelId = `${id}-panel`;
  const selectFromKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    const targetIndex = getSubsectionTabTargetIndex(
      currentIndex,
      event.key,
      options.length,
    );

    if (targetIndex === null) return;
    event.preventDefault();
    const target = options[targetIndex];

    if (!target) return;
    onChange(target.value);
    tabRefs.current[targetIndex]?.focus();
  };

  return (
    <div className={cx("ui-subsection-tabs", className)}>
      <div
        aria-label={ariaLabel}
        className="ui-subsection-tab-list"
        role="tablist"
      >
        {options.map((option, index) => {
          const selected = option.value === value;
          const tabId = `${id}-${option.value}-tab`;

          return (
            <button
              aria-controls={panelId}
              aria-selected={selected}
              className={cx(
                "ui-subsection-tab",
                selected && "is-active",
              )}
              id={tabId}
              key={option.value}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => selectFromKeyboard(event, index)}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              role="tab"
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <div
        aria-labelledby={`${id}-${options[selectedIndex]?.value ?? value}-tab`}
        className="ui-subsection-tab-panel"
        id={panelId}
        role="tabpanel"
      >
        {children}
      </div>
    </div>
  );
}
