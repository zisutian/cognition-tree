import { FieldRow } from "compact-ui";
import type { ReactNode } from "react";

/** A syntax field may be a read-only semantic value or several public controls. */
export function SyntaxRuleField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <FieldRow label={label} group>
      {(accessibility) => (
        <div role="group" aria-labelledby={accessibility["aria-labelledby"]}>
          {children}
        </div>
      )}
    </FieldRow>
  );
}
