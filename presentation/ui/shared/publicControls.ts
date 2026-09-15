import type { ComponentProps, ReactNode } from "react";
import {
  Button as ButtonImplementation,
  ToggleButton as ToggleImplementation,
} from "./Button.tsx";
import {
  CheckboxGroup as CheckboxGroupImplementation,
  CheckboxControl as CheckboxImplementation,
  ChoiceGroup as ChoiceImplementation,
  ColorControl as ColorImplementation,
  InputControl as InputImplementation,
  RangeControl as RangeImplementation,
  SelectControl as SelectImplementation,
  TextareaControl as TextareaImplementation,
  type ChoiceGroupProps,
  type ChoiceOption,
} from "./controls.tsx";

// Public capability boundary: callers choose semantics, never internal CSS or geometry.
type PublicProps<T> = T extends unknown
  ? Omit<T, "className" | "style" | "density">
  : never;
type PublicControl<C> = C extends (props: infer P) => ReactNode
  ? (props: PublicProps<P>) => ReactNode
  : never;

export const Button = ButtonImplementation as (
  props: PublicProps<
    Omit<ComponentProps<typeof ButtonImplementation>, "variant" | "density">
  > & {
    variant?:
      | "activity"
      | "danger"
      | "ghost"
      | "icon"
      | "primary"
      | "secondary"
      | "selection";
  },
) => ReactNode;
export const ToggleButton = ToggleImplementation as PublicControl<
  typeof ToggleImplementation
>;
export const InputControl = InputImplementation as PublicControl<
  typeof InputImplementation
>;
export const SelectControl = SelectImplementation as PublicControl<
  typeof SelectImplementation
>;
export const TextareaControl = TextareaImplementation as PublicControl<
  typeof TextareaImplementation
>;
export const CheckboxControl = CheckboxImplementation as PublicControl<
  typeof CheckboxImplementation
>;
export const ColorControl = ColorImplementation as PublicControl<
  typeof ColorImplementation
>;
export const RangeControl = RangeImplementation as PublicControl<
  typeof RangeImplementation
>;
export const ChoiceGroup = ChoiceImplementation as <Value extends string>(
  props: PublicProps<ChoiceGroupProps<Value>>,
) => ReactNode;
export const CheckboxGroup = CheckboxGroupImplementation as <
  Value extends string | number,
>(
  props: PublicProps<
    Omit<
      ComponentProps<typeof CheckboxGroupImplementation>,
      "options" | "values" | "onChange"
    >
  > & {
    options: readonly ChoiceOption<Value>[];
    values: readonly Value[];
    onChange(values: Value[]): void;
  },
) => ReactNode;
