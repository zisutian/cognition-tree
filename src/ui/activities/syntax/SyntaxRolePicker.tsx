import { Check, ChevronDown } from "lucide-react";
import type { ViewModel } from "../../../application/workspace/view-model/useViewModel";
import type { UiSyntaxRole } from "../../../application/workspace/projection/viewSyntax";
import { SyntaxDropdown } from "./TonePicker";

export function SyntaxRolePicker({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  options: ViewModel["syntax"]["roleOptions"];
  value: UiSyntaxRole;
  onChange: (role: UiSyntaxRole) => void;
}) {
  const selectedOption =
    options.find((option) => option.value === value) ?? {
      label: value,
      value,
    };

  return (
    <SyntaxDropdown
      ariaLabel={ariaLabel}
      className="syntax-role-picker"
      menuClassName="syntax-dropdown-menu syntax-role-menu"
      renderButton={({ isOpen, menuId, toggle }) => (
        <button
          aria-controls={menuId}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label={`${ariaLabel}: ${selectedOption.label}`}
          className="syntax-role-button"
          onClick={toggle}
          type="button"
        >
          <span>{selectedOption.label}</span>
          <ChevronDown aria-hidden="true" size={13} strokeWidth={2} />
        </button>
      )}
    >
      {({ close }) => (
        <div className="syntax-role-list" role="listbox">
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
    </SyntaxDropdown>
  );
}
