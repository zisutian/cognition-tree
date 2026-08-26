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
  onSelect,
  selected = false,
  status,
  title,
}: {
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  onSelect?: () => void;
  selected?: boolean;
  status?: ReactNode;
  title: ReactNode;
}) {
  const heading = (
    <>
      <span className="ui-management-row-title-text">{title}</span>
      {status ? <span>{status}</span> : null}
    </>
  );

  return (
    <li className={cx("ui-management-row", selected && "is-selected", className)}>
      <div className="ui-management-row-heading">
        {onSelect ? (
          <button
            aria-current={selected ? "true" : undefined}
            className="ui-management-row-title is-interactive"
            onClick={onSelect}
            type="button"
          >
            {heading}
          </button>
        ) : <div className="ui-management-row-title">{heading}</div>}
        {actions ? <div className="ui-actions">{actions}</div> : null}
      </div>
      {children ? (
        <div className="ui-management-row-details">{children}</div>
      ) : null}
    </li>
  );
}
