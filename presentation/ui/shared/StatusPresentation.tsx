// SPDX-License-Identifier: GPL-3.0-or-later

import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./primitives";

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

export type StatusSummaryItem = Readonly<{
  label: ReactNode;
  value: ReactNode;
}>;

export function StatusSummary({
  ariaLabel,
  className,
  items,
}: {
  ariaLabel: string;
  className?: string;
  items: readonly StatusSummaryItem[];
}) {
  return (
    <dl
      aria-label={ariaLabel}
      className={cx("ui-status-summary", className)}
    >
      {items.map((item, index) => (
        <div key={index}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
