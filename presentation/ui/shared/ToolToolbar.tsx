import toolbarStyles from "./Toolbar.module.css";
import { createClassNames } from "./classNames.ts";
const cx = createClassNames(toolbarStyles);
// SPDX-License-Identifier: GPL-3.0-or-later

import type { HTMLAttributes } from "react";

export function ToolToolbar({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("ui-tool-toolbar", className)} role="group" {...props} />
  );
}

export function ToolDivider({
  className,
  ...props
}: HTMLAttributes<HTMLHRElement>) {
  return <hr className={cx("ui-tool-divider", className)} {...props} />;
}
