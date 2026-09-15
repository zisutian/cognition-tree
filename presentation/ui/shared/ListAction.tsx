import type { ButtonHTMLAttributes } from "react";
import { Button } from "./Button.tsx";
import { createClassNames } from "./classNames.ts";
import compactContextListStyles from "./CompactContextList.module.css";
import contentStyles from "./Content.module.css";
import styles from "./ListAction.module.css";
import treeStyles from "./tree/Tree.module.css";
const cx = createClassNames(
  contentStyles,
  compactContextListStyles,
  treeStyles,
);

export function ListAction({
  kind = "text",
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style"> & {
  kind?: "context" | "detail" | "text";
}) {
  return (
    <Button
      {...props}
      type={props.type ?? "button"}
      variant="bare"
      className={cx(
        styles[kind],
        kind === "context" && "ui-tree-row ui-compact-context-row",
        kind === "detail" && "detail-line-row detail-line-button",
      )}
    />
  );
}
