import type { ReactNode } from "react";
import { createClassNames } from "./classNames.ts";
import styles from "./Content.module.css";
const cx = createClassNames(styles);
export function EmptyState({
  action,
  compact = false,
  description,
  title,
}: {
  action?: ReactNode;
  compact?: boolean;
  description?: ReactNode;
  title: ReactNode;
}) {
  return (
    <div className={cx("ui-empty-state", compact && "is-compact")}>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {action ? <div className={cx("ui-empty-actions")}>{action}</div> : null}
    </div>
  );
}
