import toolPropertyListStyles from "./ToolPropertyList.module.css";
import { createClassNames } from "./classNames.ts";
const cx = createClassNames(toolPropertyListStyles);
// SPDX-License-Identifier: GPL-3.0-or-later

import type { HTMLAttributes, ReactNode } from "react";

export function ToolPropertyList({
  className,
  ...props
}: HTMLAttributes<HTMLDListElement>) {
  return <dl className={cx("ui-tool-property-list", className)} {...props} />;
}

export function ToolPropertyRow({
  actions,
  className,
  label,
  value,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  actions?: ReactNode;
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className={cx("ui-tool-property-row", className)} {...props}>
      <dt>{label}</dt>
      <dd>
        <div className={cx("ui-tool-property-value")}>{value}</div>
        {actions ? (
          <div className={cx("ui-tool-property-actions")}>{actions}</div>
        ) : null}
      </dd>
    </div>
  );
}
