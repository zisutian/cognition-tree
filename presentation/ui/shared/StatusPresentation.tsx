// SPDX-License-Identifier: GPL-3.0-or-later

import type { HTMLAttributes } from "react";
import { cx } from "./primitives.tsx";

export type StatusTone = "danger" | "neutral" | "success" | "warning";

export function StatusBadge({
  children,
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusTone;
}) {
  return (
    <span
      className={cx("ui-status-badge", `ui-status-badge-${tone}`, className)}
      {...props}
    >
      {children}
    </span>
  );
}
