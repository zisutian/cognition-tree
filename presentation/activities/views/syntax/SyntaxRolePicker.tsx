import { Check, ChevronDown } from "lucide-react";
import type { SyntaxViewModel } from "../../../../application/workspace/activities/syntax/syntaxViewModel";
import type { UiSyntaxRole } from "../../../../application/workspace/projection/viewSyntax";
import { Popover } from "../../../ui/shared/Popover";

export function SyntaxRolePicker({
  ariaLabel,
  disabled = false,
  fieldId,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  disabled?: boolean;
  fieldId?: string;
  options: SyntaxViewModel["roleOptions"];
  value: UiSyntaxRole;
  onChange: (role: UiSyntaxRole) => void;
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
      className="syntax-role-picker"
      panelClassName="syntax-dropdown-menu syntax-role-menu"
      panelRole="listbox"
      renderTrigger={({ isOpen, panelId, toggle, triggerRef }) => (
        <button
          aria-controls={panelId}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-label={`${ariaLabel}: ${selectedOption.label}`}
          className="syntax-role-button"
          data-syntax-field-id={fieldId}
          disabled={disabled}
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
        <div className="syntax-role-list">
          {options.map((option) => {
            const isSelected = option.value === value;

            return (
              <button
                aria-selected={isSelected}
                className={
                  isSelected
                    ? "syntax-role-option is-selected"
                    : "syntax-role-option"
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
