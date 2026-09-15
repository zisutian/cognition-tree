import controlStyles from "./Controls.module.css";
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  forwardRef,
  useContext,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Button } from "./Button.tsx";
import { cx as joinClasses } from "./classNames.ts";

import { checkboxControlClassName } from "./controlPresentation.ts";
import { ControlSizingContext, type ControlSizing } from "./ControlSizing.ts";

function cx(...names: Array<string | false | null | undefined>) {
  const tokens = joinClasses(...names).split(/\s+/);
  return joinClasses(...tokens, ...tokens.map((name) => controlStyles[name]));
}

export type { ControlSizing } from "./ControlSizing.ts";

function sizingClass(sizing: ControlSizing) {
  return `ui-control-${sizing}`;
}

export const InputControl = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { sizing?: ControlSizing }
>(function InputControl({ className, sizing, ...props }, ref) {
  const inheritedSizing = useContext(ControlSizingContext);
  return (
    <input
      className={cx(
        "ui-control",
        "ui-input-control",
        sizingClass(sizing ?? inheritedSizing),
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});

export const CheckboxControl = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> & {
    label?: ReactNode;
  }
>(function CheckboxControl({ className, label, ...props }, ref) {
  const input = (
    <input
      {...props}
      className={cx(checkboxControlClassName, className)}
      ref={ref}
      type="checkbox"
    />
  );
  return label === undefined ? (
    input
  ) : (
    <label className={cx("ui-checkbox-option")}>
      {input}
      <span>{label}</span>
    </label>
  );
});

export const SelectControl = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { sizing?: ControlSizing }
>(function SelectControl({ className, sizing, ...props }, ref) {
  const inheritedSizing = useContext(ControlSizingContext);
  return (
    <select
      className={cx(
        "ui-control",
        "ui-select-control",
        sizingClass(sizing ?? inheritedSizing),
        className,
      )}
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
      className={cx(
        "ui-control",
        "ui-textarea-control",
        sizingClass(sizing),
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});

export type ChoiceOption<Value extends string | number> = Readonly<{
  ariaLabel?: string;
  disabled?: boolean;
  label: ReactNode;
  value: Value;
}>;

export function CheckboxGroup<Value extends string | number>({
  options,
  values,
  onChange,
  className,
  layout = "stack",
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "onChange"> & {
  layout?: "stack" | "wrap";
  options: readonly ChoiceOption<Value>[];
  values: readonly Value[];
  onChange(values: Value[]): void;
}) {
  return (
    <div
      {...props}
      className={cx(
        "ui-checkbox-group",
        `ui-checkbox-group-${layout}`,
        className,
      )}
      role="group"
    >
      {options.map((option) => (
        <CheckboxControl
          key={option.value}
          label={option.label}
          aria-label={option.ariaLabel}
          checked={values.includes(option.value)}
          disabled={option.disabled}
          onChange={(event) =>
            onChange(
              event.currentTarget.checked
                ? [...values, option.value]
                : values.filter((value) => value !== option.value),
            )
          }
        />
      ))}
    </div>
  );
}

type ChoiceGroupBase<Value extends string> = {
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  ariaLabel: string;
  className?: string;
  id?: string;
  layout?: "inline" | "wrap";
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
    const index =
      (start + offset * direction + options.length) % options.length;

    if (!options[index]?.disabled) return index;
  }
  return start;
}

export function ChoiceGroup<Value extends string>(
  props: ChoiceGroupProps<Value>,
) {
  const { ariaLabel, className, id, layout = "wrap", mode, options } = props;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex =
    mode === "single"
      ? options.findIndex(
          ({ value, disabled }) => value === props.value && !disabled,
        )
      : -1;
  const tabStopIndex =
    selectedIndex >= 0
      ? selectedIndex
      : options.findIndex(({ disabled }) => !disabled);
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
      className={cx("ui-choice-group", `ui-choice-group-${layout}`, className)}
      role={mode === "single" ? "radiogroup" : "group"}
      id={id}
    >
      {options.map((option, index) => {
        const selected =
          mode === "single"
            ? option.value === props.value
            : props.values.includes(option.value);

        return (
          <Button
            variant="selection"
            {...(mode === "single"
              ? { "aria-checked": selected, role: "radio" }
              : { "aria-pressed": selected })}
            aria-label={option.ariaLabel}
            className="ui-choice-option"
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
            tabIndex={mode === "single" ? (index === tabStopIndex ? 0 : -1) : 0}
            type="button"
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

export const RangeControl = forwardRef<
  HTMLInputElement,
  Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "max" | "min" | "type" | "value"
  > & {
    max: number;
    min: number;
    value: number;
    valueLabel?: string;
  }
>(function RangeControl(
  { className, max, min, style, value, valueLabel, ...props },
  ref,
) {
  const progress = max === min ? 0 : ((value - min) / (max - min)) * 100;

  const input = (
    <input
      className={cx("ui-range-control", className)}
      aria-valuetext={valueLabel}
      max={max}
      min={min}
      ref={ref}
      style={
        {
          ...style,
          "--ui-range-progress": `${Math.max(0, Math.min(100, progress))}%`,
        } as CSSProperties
      }
      type="range"
      value={value}
      {...props}
    />
  );
  return valueLabel === undefined ? (
    input
  ) : (
    <div className={cx("ui-range-field")}>
      {input}
      <output
        className={cx("ui-range-value")}
        htmlFor={props.id}
        aria-hidden="true"
      >
        {valueLabel}
      </output>
    </div>
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
