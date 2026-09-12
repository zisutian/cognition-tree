import { Check, ChevronDown } from "lucide-react";
import type { SyntaxViewModel } from "../../../application/syntax/index.ts";
import {
  Popover,
  Button,
} from "../../ui/index.ts";


type SyntaxKind = SyntaxViewModel["kindOptions"][number]["value"];

export function SyntaxKindPicker({
  disabled = false,
  ariaLabel,
  fieldId,
  options,
  value,
  onChange,
}: {
  disabled?: boolean;
  ariaLabel: string;
  fieldId?: string;
  options: SyntaxViewModel["kindOptions"];
  value: SyntaxKind;
  onChange: (kind: SyntaxKind) => void;
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
        <Button
          disabled={disabled}
          aria-controls={panelId}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-label={`${ariaLabel}: ${selectedOption.label}`}
          className="syntax-kind-button"
          data-syntax-field-id={fieldId}
          onClick={toggle}
          ref={triggerRef}
          type="button"
          variant="bare"
        >
          <span>{selectedOption.label}</span>
          <ChevronDown aria-hidden="true" size={13} strokeWidth={2} />
        </Button>
      )}
    >
      {({ close }) => (
        <div className="syntax-kind-list">
          {options.map((option) => {
            const isSelected = option.value === value;

            return (
              <Button
                disabled={disabled}
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
                variant="bare"
              >
                <span>{option.label}</span>
                {isSelected ? (
                  <Check aria-hidden="true" size={12} strokeWidth={2.4} />
                ) : null}
              </Button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}
