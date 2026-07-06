import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./classNames";

type UiEmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  actions?: ReactNode;
  description?: ReactNode;
  fill?: boolean;
  title: ReactNode;
};

export function UiEmptyState({
  actions,
  className,
  description,
  fill = false,
  title,
  ...props
}: UiEmptyStateProps) {
  return (
    <div
      className={cx("ui-empty-state", fill && "ui-empty-state-fill", className)}
      {...props}
    >
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {actions ? <div className="ui-empty-state-actions">{actions}</div> : null}
    </div>
  );
}
