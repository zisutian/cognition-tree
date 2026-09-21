import { Button, ChoiceGroup, ColorControl, Stack } from "compact-ui";
import { ChevronDown } from "lucide-react";
import type { CSSProperties } from "react";
import type {
  SyntaxTone,
  SyntaxToneOption,
} from "../../../application/syntax/index.ts";
import {
  createClassNames,
  isCustomTone,
  TriggerPopover,
} from "../../ui/index.ts";
import syntaxStyles from "./syntax.module.css";
const cx = createClassNames(syntaxStyles);

const defaultCustomTone = "#397c72";

type TonePickerProps = {
  disabled?: boolean;
  ariaLabel: string;
  customToneLabel: string;
  fieldId?: string;
  options: SyntaxToneOption[];
  showLabel?: boolean;
  value: SyntaxTone;
  onChange: (tone: SyntaxTone) => void;
};

function getToneLabel(
  tone: SyntaxTone,
  options: SyntaxToneOption[],
  customToneLabel: string,
) {
  if (isCustomTone(tone)) {
    return customToneLabel;
  }

  const option = options.find((candidate) => candidate.value === tone);

  if (!option) {
    throw new Error(`Missing projected syntax tone label: ${tone}`);
  }

  return option.label;
}

export function getToneSwatchClass(tone: SyntaxTone) {
  return isCustomTone(tone)
    ? "syntax-tone-swatch syntax-tone-custom"
    : `syntax-tone-swatch syntax-tone-${tone}`;
}

export function getToneSwatchStyle(
  tone: SyntaxTone,
): CSSProperties | undefined {
  return isCustomTone(tone)
    ? ({ "--syntax-tone-color": tone } as CSSProperties)
    : undefined;
}

export function TonePicker({
  disabled = false,
  ariaLabel,
  customToneLabel,
  fieldId,
  options,
  showLabel = true,
  value,
  onChange,
}: TonePickerProps) {
  const isCustomValue = isCustomTone(value);
  const customTone = isCustomValue ? value : defaultCustomTone;

  const selectTone = (tone: SyntaxTone) => {
    onChange(tone);
  };

  return (
    <TriggerPopover
      ariaLabel={ariaLabel}
      renderTrigger={({ isOpen, panelId, toggle, triggerRef }) => (
        <Button
          disabled={disabled}
          aria-controls={panelId}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label={`${ariaLabel}: ${getToneLabel(value, options, customToneLabel)}`}
          data-syntax-field-id={fieldId}
          onClick={toggle}
          ref={triggerRef}
          type="button"
          variant="normal"
        >
          <span
            aria-hidden="true"
            className={cx(getToneSwatchClass(value))}
            style={getToneSwatchStyle(value)}
          >
            <span />
          </span>
          {showLabel ? (
            <span>{getToneLabel(value, options, customToneLabel)}</span>
          ) : null}
          <ChevronDown aria-hidden="true" size={13} strokeWidth={2} />
        </Button>
      )}
    >
      {({ close }) => (
        <>
          <ChoiceGroup
            ariaLabel="预设颜色"
            mode="single"
            value={value}
            options={options.map((option) => ({
              value: option.value,
              title: option.label,
              disabled,
              label: (
                <>
                  <span
                    aria-hidden="true"
                    className={cx(getToneSwatchClass(option.value))}
                  >
                    <span />
                  </span>
                  {option.label}
                </>
              ),
            }))}
            onChange={(tone) => {
              selectTone(tone);
              close();
            }}
          />

          <Stack direction="row" align="center" wrap>
            <Button
              disabled={disabled}
              aria-pressed={isCustomValue}
              onClick={() => {
                selectTone(customTone);
                close();
              }}
              type="button"
              variant="normal"
            >
              <span
                aria-hidden="true"
                className={cx("syntax-tone-swatch syntax-tone-custom")}
                style={getToneSwatchStyle(customTone)}
              >
                <span />
              </span>
              {customToneLabel}
            </Button>
            <ColorControl
              disabled={disabled}
              aria-label="自定义颜色"
              value={customTone}
              onChange={(event) => {
                if (isCustomTone(event.target.value)) {
                  onChange(event.target.value);
                }
              }}
            />
          </Stack>
        </>
      )}
    </TriggerPopover>
  );
}
