import { Check, ChevronDown } from "lucide-react";
import type { SyntaxViewModel } from "../../../application/syntax/syntaxViewModel";
import type { CtnBlockKind } from "../../../core/ctn/syntax/types";
import { Popover } from "../../ui/shared/Popover";

export function SyntaxKindPicker({
  ariaLabel,
  fieldId,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  fieldId?: string;
  options: SyntaxViewModel["kindOptions"];
  value: CtnBlockKind;
  onChange: (kind: CtnBlockKind) => void;
}) {
  const selectedOption =
    options.find((option) => option.value === value) ?? {
      label: value,
      value,
    };

  return (
    <Popover
      align="center"
      ariaLabel={ariaLabel}
      className="syntax-kind-picker"
      panelClassName="syntax-dropdown-menu syntax-kind-menu"
      panelRole="listbox"
      renderTrigger={({ isOpen, panelId, toggle, triggerRef }) => (
        <button
          aria-controls={panelId}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-label={`${ariaLabel}: ${selectedOption.label}`}
          className="syntax-kind-button"
          data-syntax-field-id={fieldId}
          onClick={toggle}
          ref={triggerRef}
          type="button"
        >
          <span>{selectedOption.label}</span>
          <ChevronDown aria-hidden="true" size={13} strokeWidth={2} />
        </button>
      )}
    >
      {({ close }) => (
        <div className="syntax-kind-list">
          {options.map((option) => {
            const isSelected = option.value === value;

            return (
              <button
                aria-selected={isSelected}
                className={
                  isSelected
                    ? "syntax-kind-option is-selected"
                    : "syntax-kind-option"
                }
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  close();
                }}
                role="option"
                type="button"
              >
                <span>{option.label}</span>
                {isSelected ? (
                  <Check aria-hidden="true" size={12} strokeWidth={2.4} />
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}
