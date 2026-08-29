import { Check, ChevronDown } from "lucide-react";
import type { CSSProperties } from "react";
import type {
  SyntaxTone,
  SyntaxToneOption,
} from "../../../application/syntax/syntaxProjection";
import { Popover } from "../../ui/shared/Popover";
import { ColorControl } from "../../ui/shared/controls";
import { Button } from "../../ui/shared/primitives";
import { isCustomTone } from "../../ui/shared/tonePresentation";

const defaultCustomTone = "#397c72";

type TonePickerProps = {
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
    <Popover
      ariaLabel={ariaLabel}
      className="syntax-tone-picker"
      panelClassName="syntax-dropdown-menu syntax-tone-menu"
      panelRole="dialog"
      renderTrigger={({ isOpen, panelId, toggle, triggerRef }) => (
        <Button
          aria-controls={panelId}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label={`${ariaLabel}: ${getToneLabel(value, options, customToneLabel)}`}
          className={showLabel ? "syntax-tone-button" : "syntax-tone-button is-compact"}
          data-syntax-field-id={fieldId}
          onClick={toggle}
          ref={triggerRef}
          type="button"
          variant="bare"
        >
          <span
            aria-hidden="true"
            className={getToneSwatchClass(value)}
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
          <div className="syntax-tone-grid" role="group" aria-label="预设颜色">
            {options.map((option) => {
              const selectOption = () => {
                selectTone(option.value);
                close();
              };

              return (
                <Button
                  aria-label={option.label}
                  className={
                    value === option.value
                      ? "syntax-tone-tile is-selected"
                      : "syntax-tone-tile"
                  }
                  key={option.value}
                  onClick={selectOption}
                  title={option.label}
                  type="button"
                  variant="bare"
                >
                  <span
                    aria-hidden="true"
                    className={getToneSwatchClass(option.value)}
                  >
                    <span />
                  </span>
                  {value === option.value ? (
                    <Check aria-hidden="true" size={12} strokeWidth={2.4} />
                  ) : null}
                </Button>
              );
            })}
          </div>

          <div className="syntax-tone-custom-row">
            <Button
              className={
                isCustomValue
                  ? "syntax-tone-custom-button is-selected"
                  : "syntax-tone-custom-button"
              }
              onClick={() => {
                selectTone(customTone);
                close();
              }}
              type="button"
              variant="bare"
            >
              <span
                aria-hidden="true"
                className="syntax-tone-swatch syntax-tone-custom"
                style={getToneSwatchStyle(customTone)}
              >
                <span />
              </span>
              {customToneLabel}
            </Button>
            <ColorControl
              aria-label="自定义颜色"
              value={customTone}
              onChange={(event) => {
                if (isCustomTone(event.target.value)) {
                  onChange(event.target.value);
                }
              }}
            />
          </div>
        </>
      )}
    </Popover>
  );
}
