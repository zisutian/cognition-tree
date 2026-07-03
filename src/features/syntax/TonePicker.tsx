import { Check, ChevronDown } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { isCustomSyntaxTone } from "../../ctn-syntax/tones";
import type {
  CtnPresetSyntaxTone,
  CtnSyntaxTone,
} from "../../ctn-syntax/types";
import { syntaxTones } from "./syntaxProfileDraft";

const toneLabels: Record<CtnPresetSyntaxTone, string> = {
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
  value: CtnSyntaxTone;
  onChange: (tone: CtnSyntaxTone) => void;
};

function getToneLabel(tone: CtnSyntaxTone) {
  if (isCustomSyntaxTone(tone)) {
    return "自定义";
  }

  if (tone === "default") {
    return "默认";
  }

  return toneLabels[tone];
}

export function getToneSwatchClass(tone: CtnSyntaxTone) {
  return isCustomSyntaxTone(tone)
    ? "syntax-tone-swatch syntax-tone-custom"
    : `syntax-tone-swatch syntax-tone-${tone}`;
}

export function getToneSwatchStyle(
  tone: CtnSyntaxTone,
): CSSProperties | undefined {
  return isCustomSyntaxTone(tone)
    ? ({ "--syntax-tone-color": tone } as CSSProperties)
    : undefined;
}

export function TonePicker({ ariaLabel, value, onChange }: TonePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const isCustomTone = isCustomSyntaxTone(value);
  const customTone = isCustomTone ? value : defaultCustomTone;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        pickerRef.current &&
        event.target instanceof Node &&
        !pickerRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const selectTone = (tone: CtnSyntaxTone) => {
    onChange(tone);
    setIsOpen(false);
  };

  return (
    <div className="syntax-tone-picker" ref={pickerRef}>
      <button
        aria-controls={menuId}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="syntax-tone-button"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span
          aria-hidden="true"
          className={getToneSwatchClass(value)}
          style={getToneSwatchStyle(value)}
        >
          <span />
        </span>
        <span>{getToneLabel(value)}</span>
        <ChevronDown aria-hidden="true" size={13} strokeWidth={2} />
      </button>

      {isOpen ? (
        <div
          aria-label={ariaLabel}
          className="syntax-tone-menu"
          id={menuId}
          role="dialog"
        >
          <div className="syntax-tone-grid" role="group" aria-label="预设颜色">
            {syntaxTones.map((tone) => (
              <button
                aria-label={toneLabels[tone]}
                className={
                  value === tone
                    ? "syntax-tone-tile is-selected"
                    : "syntax-tone-tile"
                }
                key={tone}
                onClick={() => selectTone(tone)}
                title={toneLabels[tone]}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={getToneSwatchClass(tone)}
                >
                  <span />
                </span>
                {value === tone ? (
                  <Check aria-hidden="true" size={12} strokeWidth={2.4} />
                ) : null}
              </button>
            ))}
          </div>

          <div className="syntax-tone-custom-row">
            <button
              className={
                isCustomTone
                  ? "syntax-tone-custom-button is-selected"
                  : "syntax-tone-custom-button"
              }
              onClick={() => selectTone(customTone)}
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
              onChange={(event) =>
                onChange(event.target.value as CtnSyntaxTone)
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
