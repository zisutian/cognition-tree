import type { HTMLAttributes } from "react";
import { createClassNames } from "./classNames.ts";
import styles from "./Content.module.css";
const cx = createClassNames(styles);
export function SymbolSlot({
  children,
  className,
  tone = "muted",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "danger" | "link" | "muted" | "strong" | "warning";
}) {
  return (
    <span
      className={cx("ui-symbol-slot", `ui-symbol-slot-${tone}`, className)}
      {...props}
    >
      {children}
    </span>
  );
}
