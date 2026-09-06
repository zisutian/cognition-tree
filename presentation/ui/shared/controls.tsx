// SPDX-License-Identifier: GPL-3.0-or-later

import {
  forwardRef,
  useRef,
  type CSSProperties,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cx } from "./primitives.tsx";

export type ControlSizing = "container" | "content";

function sizingClass(sizing: ControlSizing) {
  return `ui-control-${sizing}`;
}

export const InputControl = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { sizing?: ControlSizing }
>(function InputControl({ className, sizing = "content", ...props }, ref) {
  return (
    <input
      className={cx("ui-control", "ui-input-control", sizingClass(sizing), className)}
      ref={ref}
      {...props}
    />
  );
});

export const SelectControl = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { sizing?: ControlSizing }
>(function SelectControl({ className, sizing = "content", ...props }, ref) {
  return (
    <select
      className={cx("ui-control", "ui-select-control", sizingClass(sizing), className)}
      ref={ref}
      {...props}
    />
  );
});

export const TextareaControl = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { sizing?: ControlSizing }
>(function TextareaControl({ className, sizing = "container", ...props }, ref) {
  return (
    <textarea
      className={cx("ui-control", "ui-textarea-control", sizingClass(sizing), className)}
      ref={ref}
      {...props}
    />
  );
});

export type ChoiceOption<Value extends string> = Readonly<{
  ariaLabel?: string;
  disabled?: boolean;
  label: ReactNode;
  value: Value;
}>;

type ChoiceGroupBase<Value extends string> = {
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  ariaLabel: string;
  className?: string;
  id?: string;
  layout?: "joined" | "wrap";
  options: readonly ChoiceOption<Value>[];
};

type SingleChoiceGroupProps<Value extends string> = ChoiceGroupBase<Value> & {
  mode: "single";
  onChange(value: Value): void;
  value: Value;
  values?: never;
};

type MultipleChoiceGroupProps<Value extends string> = ChoiceGroupBase<Value> & {
  mode: "multiple";
  onChange(values: Value[]): void;
  value?: never;
  values: readonly Value[];
};

export type ChoiceGroupProps<Value extends string> =
  | MultipleChoiceGroupProps<Value>
  | SingleChoiceGroupProps<Value>;

function nextEnabledIndex<Value extends string>(
  options: readonly ChoiceOption<Value>[],
  start: number,
  direction: -1 | 1,
) {
  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (start + offset * direction + options.length) % options.length;

    if (!options[index]?.disabled) return index;
  }
  return start;
}

export function ChoiceGroup<Value extends string>(props: ChoiceGroupProps<Value>) {
  const {
    ariaLabel,
    className,
    id,
    layout = "joined",
    mode,
    options,
  } = props;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = mode === "single"
    ? Math.max(0, options.findIndex(({ value }) => value === props.value))
    : -1;
  const onSingleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    if (mode !== "single") return;
    let targetIndex: number | null = null;

    if (event.key === "Home") {
      targetIndex = options.findIndex(({ disabled }) => !disabled);
    } else if (event.key === "End") {
      targetIndex = [...options]
        .reverse()
        .findIndex(({ disabled }) => !disabled);
      targetIndex = targetIndex < 0 ? -1 : options.length - targetIndex - 1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      targetIndex = nextEnabledIndex(options, currentIndex, -1);
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      targetIndex = nextEnabledIndex(options, currentIndex, 1);
    }
    if (targetIndex === null || targetIndex < 0) return;
    const target = options[targetIndex];

    if (!target) return;
    event.preventDefault();
    props.onChange(target.value);
    refs.current[targetIndex]?.focus();
  };

  return (
    <div
      aria-describedby={props["aria-describedby"]}
      aria-invalid={props["aria-invalid"]}
      aria-label={ariaLabel}
      className={cx(
        "ui-choice-group",
        `ui-choice-group-${layout}`,
        className,
      )}
      role={mode === "single" ? "radiogroup" : "group"}
      id={id}
    >
      {options.map((option, index) => {
        const selected = mode === "single"
          ? option.value === props.value
          : props.values.includes(option.value);

        return (
          <button
            {...(mode === "single"
              ? { "aria-checked": selected, role: "radio" }
              : { "aria-pressed": selected })}
            aria-label={option.ariaLabel}
            className={cx("ui-choice-option", selected && "is-active")}
            disabled={option.disabled}
            key={option.value}
            onClick={() => {
              if (mode === "single") {
                props.onChange(option.value);
                return;
              }
              props.onChange(
                selected
                  ? props.values.filter((value) => value !== option.value)
                  : [...props.values, option.value],
              );
            }}
            onKeyDown={(event) => onSingleKeyDown(event, index)}
            ref={(element) => {
              refs.current[index] = element;
            }}
            tabIndex={mode === "single" ? (index === selectedIndex ? 0 : -1) : 0}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export const RangeControl = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "max" | "min" | "type" | "value"> & {
    max: number;
    min: number;
    value: number;
  }
>(function RangeControl({ className, max, min, style, value, ...props }, ref) {
  const progress = max === min ? 0 : ((value - min) / (max - min)) * 100;

  return (
    <input
      className={cx("ui-range-control", className)}
      max={max}
      min={min}
      ref={ref}
      style={{
        ...style,
        "--ui-range-progress": `${Math.max(0, Math.min(100, progress))}%`,
      } as CSSProperties}
      type="range"
      value={value}
      {...props}
    />
  );
});

export const ColorControl = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type">
>(function ColorControl({ className, ...props }, ref) {
  return (
    <input
      className={cx("ui-color-control", className)}
      ref={ref}
      type="color"
      {...props}
    />
  );
});
