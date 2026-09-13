// SPDX-License-Identifier: GPL-3.0-or-later

import type { SyntaxViewModel } from "../../../application/syntax/index.ts";
import { SelectControl } from "../../ui/index.ts";

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
  return (
    <SelectControl
      aria-label={ariaLabel}
      data-syntax-field-id={fieldId}
      disabled={disabled}
      sizing="container"
      value={value}
      onChange={(event) => {
        const selected = options.find(
          (option) => option.value === event.currentTarget.value,
        );
        if (selected) onChange(selected.value);
      }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </SelectControl>
  );
}
