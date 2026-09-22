import { FieldRow, FormLayout, List } from "compact-ui";
import type { ReactNode } from "react";

/** The package owns responsive columns and spacing; the host owns field content. */
export function SyntaxRuleFields({ children }: { children: ReactNode }) {
  return (
    <List aria-label="规则字段" columns="auto" rowGap="normal">
      {children}
    </List>
  );
}

/** A syntax field may be a read-only semantic value or several public controls. */
export function SyntaxRuleField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <li>
      <FormLayout layout="stacked">
        <FieldRow label={label} group>
          {(accessibility) => (
            <div
              role="group"
              aria-labelledby={accessibility["aria-labelledby"]}
            >
              {children}
            </div>
          )}
        </FieldRow>
      </FormLayout>
    </li>
  );
}
