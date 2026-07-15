import { Check, ChevronDown } from "lucide-react";
import type { CSSProperties } from "react";
import type {
  UiSyntaxTone,
  UiSyntaxToneOption,
} from "../../../application/workspace/projection/viewSyntax";
import { Popover } from "../../shared/Popover";
import { isCustomTone } from "../../shared/tonePresentation";

const toneLabels: Record<string, string> = {
  amber: "琥珀",
  blue: "蓝色",
  cyan: "青色",
  gray: "灰色",
  green: "绿色",
  indigo: "靛蓝",
  pink: "粉色",
  red: "红色",
  teal: "青绿",
  violet: "紫色",
};

const defaultCustomTone = "#397c72";

type TonePickerProps = {
  ariaLabel: string;
  fieldId?: string;
  options: UiSyntaxToneOption[];
  showLabel?: boolean;
  value: UiSyntaxTone;
  onChange: (tone: UiSyntaxTone) => void;
};

function getToneLabel(tone: UiSyntaxTone, options: UiSyntaxToneOption[]) {
  if (isCustomTone(tone)) {
    return "自定义";
  }

  if (tone === "default") {
    return "默认";
  }

  return (
    options.find((option) => option.value === tone)?.label ??
    toneLabels[tone] ??
    tone
  );
}

export function getToneSwatchClass(tone: UiSyntaxTone) {
  return isCustomTone(tone)
    ? "syntax-tone-swatch syntax-tone-custom"
    : `syntax-tone-swatch syntax-tone-${tone}`;
}

export function getToneSwatchStyle(
  tone: UiSyntaxTone,
): CSSProperties | undefined {
  return isCustomTone(tone)
    ? ({ "--syntax-tone-color": tone } as CSSProperties)
    : undefined;
}

export function TonePicker({
  ariaLabel,
  fieldId,
  options,
  showLabel = true,
  value,
  onChange,
}: TonePickerProps) {
  const isCustomValue = isCustomTone(value);
  const customTone = isCustomValue ? value : defaultCustomTone;

  const selectTone = (tone: UiSyntaxTone) => {
    onChange(tone);
  };

  return (
    <Popover
      ariaLabel={ariaLabel}
      className="syntax-tone-picker"
      panelClassName="syntax-dropdown-menu syntax-tone-menu"
      panelRole="dialog"
      renderTrigger={({ isOpen, panelId, toggle, triggerRef }) => (
        <button
          aria-controls={panelId}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label={`${ariaLabel}: ${getToneLabel(value, options)}`}
          className={showLabel ? "syntax-tone-button" : "syntax-tone-button is-compact"}
          data-syntax-field-id={fieldId}
          onClick={toggle}
          ref={triggerRef}
          type="button"
        >
          <span
            aria-hidden="true"
            className={getToneSwatchClass(value)}
            style={getToneSwatchStyle(value)}
          >
            <span />
          </span>
          {showLabel ? <span>{getToneLabel(value, options)}</span> : null}
          <ChevronDown aria-hidden="true" size={13} strokeWidth={2} />
        </button>
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
                <button
                  aria-label={getToneLabel(option.value, options)}
                  className={
                    value === option.value
                      ? "syntax-tone-tile is-selected"
                      : "syntax-tone-tile"
                  }
                  key={option.value}
                  onClick={selectOption}
                  title={getToneLabel(option.value, options)}
                  type="button"
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
                </button>
              );
            })}
          </div>

          <div className="syntax-tone-custom-row">
            <button
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
            >
              <span
                aria-hidden="true"
                className="syntax-tone-swatch syntax-tone-custom"
                style={getToneSwatchStyle(customTone)}
              >
                <span />
              </span>
              自定义
            </button>
            <input
              aria-label="自定义颜色"
              type="color"
              value={customTone}
              onChange={(event) => onChange(event.target.value)}
            />
          </div>
        </>
      )}
    </Popover>
  );
}
