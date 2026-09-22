import { List, Stack, StatusText } from "compact-ui";
import type { ReactNode } from "react";

const blockColumns = ["名称", "标记", "角色", "背景色", "文字色", "操作"];
const inlineColumns = ["名称", "标记", "结束", "角色", "颜色", "操作"];

/** Each rule uses the same six public List columns as its shared heading. */
export function SyntaxRuleFields({ children }: { children: ReactNode }) {
  return (
    <List aria-label="规则字段" columns={blockColumns.length}>
      {children}
    </List>
  );
}

export function SyntaxRuleHeader({ inline = false }: { inline?: boolean }) {
  const columns = inline ? inlineColumns : blockColumns;
  return (
    <List
      aria-label={inline ? "行内规则列名" : "块规则列名"}
      columns={columns.length}
    >
      {columns.map((label) => (
        <SyntaxRuleField key={label} label={label}>
          <StatusText>{label}</StatusText>
        </SyntaxRuleField>
      ))}
    </List>
  );
}

/** Column names are shown once; each cell and native control retains its name. */
export function SyntaxRuleField({
  label,
  children,
}: {
  label: string;
  children?: ReactNode;
}) {
  return (
    <li aria-label={label}>
      <Stack direction="row" align="center" fill>
        {children}
      </Stack>
    </li>
  );
}
