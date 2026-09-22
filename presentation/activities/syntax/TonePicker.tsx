import { ColorPicker, useDesignConfig } from "compact-ui";
import { useLayoutEffect, useRef, useState } from "react";
import type {
  SyntaxTone,
  SyntaxToneOption,
} from "../../../application/syntax/index.ts";
import { isCustomTone, useFeedback } from "../../ui/index.ts";
import { customSyntaxColor, syntaxToneColor } from "./syntaxColorValue.ts";

type TonePickerProps = {
  disabled?: boolean;
  ariaLabel: string;
  customToneLabel: string;
  fieldId?: string;
  options: SyntaxToneOption[];
  channel?: "background" | "text";
  value: SyntaxTone;
  onChange: (tone: SyntaxTone) => void;
};

/** Only maps CTN tone identities; the public picker owns all color UI and focus. */
export function TonePicker({
  disabled = false,
  ariaLabel,
  customToneLabel,
  fieldId,
  options,
  channel = "text",
  value,
  onChange,
}: TonePickerProps) {
  const feedback = useFeedback();
  const config = useDesignConfig();
  const trigger = useRef<HTMLButtonElement>(null);
  const [resolvedColors, setResolvedColors] = useState<Record<string, string>>(
    {},
  );
  useLayoutEffect(() => {
    if (!trigger.current) return;
    const style = getComputedStyle(trigger.current);
    // Read the existing content palette; do not duplicate its color definitions.
    setResolvedColors(
      Object.fromEntries(
        options.map((option) => {
          const color = syntaxToneColor(option.value, channel);
          const variable = /^var\((--[\w-]+)\)$/.exec(color);
          return [
            color,
            variable ? style.getPropertyValue(variable[1]).trim() : color,
          ];
        }),
      ),
    );
  }, [options, channel, config]);
  const displayColor = (tone: SyntaxTone) => {
    const color = syntaxToneColor(tone, channel);
    return resolvedColors[color] || color;
  };
  const label = isCustomTone(value)
    ? `${customToneLabel} ${value}`
    : options.find((option) => option.value === value)?.label;
  if (!label) throw new Error(`Missing projected syntax tone label: ${value}`);
  const palette = options.map((option) => ({
    label: option.label,
    value: displayColor(option.value),
  }));

  return (
    <ColorPicker
      disabled={disabled}
      ref={trigger}
      aria-label={`${ariaLabel}: ${label}`}
      title={`${ariaLabel}: ${label}`}
      data-syntax-field-id={fieldId}
      sizing="fill"
      value={displayColor(value)}
      options={palette}
      onChange={(color) => {
        feedback.runAction(() => {
          const index = palette.findIndex(
            (option) => option.value.toLowerCase() === color.toLowerCase(),
          );
          onChange(
            index >= 0 ? options[index].value : customSyntaxColor(color),
          );
        });
      }}
    />
  );
}
