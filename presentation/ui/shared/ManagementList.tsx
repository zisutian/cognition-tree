// SPDX-License-Identifier: GPL-3.0-or-later

import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./primitives";

export function ManagementList({
  className,
  ...props
}: HTMLAttributes<HTMLUListElement>) {
  return <ul className={cx("ui-management-list", className)} {...props} />;
}

export function ManagementRow({
  actions,
  children,
  className,
  description,
  status,
  title,
}: {
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  status?: ReactNode;
  title: ReactNode;
}) {
  return (
    <li className={cx("ui-management-row", className)}>
      <div className="ui-management-row-heading">
        <div className="ui-management-row-title">
          <strong>{title}</strong>
          {status ? <span>{status}</span> : null}
        </div>
        {actions ? <div className="ui-actions">{actions}</div> : null}
      </div>
      {description ? (
        <div className="ui-management-row-description">{description}</div>
      ) : null}
      {children ? (
        <div className="ui-management-row-details">{children}</div>
      ) : null}
    </li>
  );
}
