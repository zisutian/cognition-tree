import { createClassNames } from "./classNames.ts";
import contentStyles from "./Content.module.css";
import managementListStyles from "./ManagementList.module.css";
import toolListStyles from "./ToolList.module.css";
import treeStyles from "./tree/Tree.module.css";
const cx = createClassNames(
  contentStyles,
  toolListStyles,
  managementListStyles,
  treeStyles,
);
// SPDX-License-Identifier: GPL-3.0-or-later

import type { HTMLAttributes, ReactNode } from "react";
import { Button } from "./Button.tsx";

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
      <span className={cx("ui-management-row-title-text")}>{title}</span>
      {status ? <span>{status}</span> : null}
    </>
  );

  return (
    <li
      className={cx("ui-management-row", selected && "is-selected", className)}
    >
      <div className={cx("ui-management-row-heading")}>
        {onSelect ? (
          <Button
            variant="bare"
            aria-current={selected ? "true" : undefined}
            className={cx("ui-management-row-title is-interactive")}
            onClick={onSelect}
            type="button"
          >
            {heading}
          </Button>
        ) : (
          <div className={cx("ui-management-row-title")}>{heading}</div>
        )}
        {actions ? <div className={cx("ui-actions")}>{actions}</div> : null}
      </div>
      {children ? (
        <div className={cx("ui-management-row-details")}>{children}</div>
      ) : null}
    </li>
  );
}
