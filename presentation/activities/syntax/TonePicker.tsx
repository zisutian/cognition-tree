import {
  Button,
  ChoiceGroup,
  ColorControl,
  Stack,
  useDesignConfig,
} from "compact-ui";
import { ChevronDown } from "lucide-react";
import type {
  SyntaxTone,
  SyntaxToneOption,
} from "../../../application/syntax/index.ts";
import { isCustomTone, TriggerPopover } from "../../ui/index.ts";

type TonePickerProps = {
  disabled?: boolean;
  ariaLabel: string;
  customToneLabel: string;
  fieldId?: string;
  options: SyntaxToneOption[];
  value: SyntaxTone;
  onChange: (tone: SyntaxTone) => void;
};

/** Map syntax values to public controls; the detail region owns color preview. */
export function TonePicker({
  disabled = false,
  ariaLabel,
  customToneLabel,
  fieldId,
  options,
  value,
  onChange,
}: TonePickerProps) {
  const { colors } = useDesignConfig();
  const isCustomValue = isCustomTone(value);
  const customTone = isCustomValue ? value : colors.accent;
  const label = isCustomValue
    ? customToneLabel
    : options.find((option) => option.value === value)?.label;
  if (!label) throw new Error(`Missing projected syntax tone label: ${value}`);

  return (
    <TriggerPopover
      ariaLabel={ariaLabel}
      renderTrigger={({ isOpen, panelId, toggle, triggerRef }) => (
        <Button
          disabled={disabled}
          aria-controls={panelId}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label={`${ariaLabel}: ${label}`}
          data-syntax-field-id={fieldId}
          onClick={toggle}
          ref={triggerRef}
        >
          {label}
          <ChevronDown aria-hidden="true" />
        </Button>
      )}
    >
      {({ close }) => (
        <Stack>
          <ChoiceGroup
            aria-label="预设颜色"
            mode="single"
            value={value}
            options={options.map((option) => ({ ...option, disabled }))}
            onChange={(tone) => {
              onChange(tone);
              close();
            }}
          />
          <Stack direction="row" align="center" wrap>
            <Button
              disabled={disabled}
              aria-pressed={isCustomValue}
              onClick={() => {
                if (isCustomTone(customTone)) onChange(customTone);
                close();
              }}
            >
              {customToneLabel}
            </Button>
            <ColorControl
              disabled={disabled}
              aria-label="自定义颜色"
              value={customTone}
              onChange={(event) => {
                if (isCustomTone(event.target.value))
                  onChange(event.target.value);
              }}
            />
          </Stack>
        </Stack>
      )}
    </TriggerPopover>
  );
}
