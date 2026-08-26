// SPDX-License-Identifier: GPL-3.0-or-later

import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { CompactContextList } from "./CompactContextList";
import { cx } from "./primitives";

export type CollapsibleContextGroupProps = {
  children: ReactNode;
  className?: string;
  count?: number;
  expanded: boolean;
  headingId: string;
  label: ReactNode;
  listAriaLabel?: string;
  listClassName?: string;
  onExpandedChange: (expanded: boolean) => void;
};

export function CollapsibleContextGroup({
  children,
  className,
  count,
  expanded,
  headingId,
  label,
  listAriaLabel,
  listClassName,
  onExpandedChange,
}: CollapsibleContextGroupProps) {
  const contentId = `${headingId}-content`;

  return (
    <section
      aria-labelledby={headingId}
      className={cx("ui-collapsible-context-group", className)}
    >
      <h3 id={headingId}>
        <button
          aria-controls={contentId}
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
          type="button"
        >
          {expanded ? (
            <ChevronDown aria-hidden="true" size={13} />
          ) : (
            <ChevronRight aria-hidden="true" size={13} />
          )}
          <span>{label}</span>
          {count === undefined ? null : <span>{count}</span>}
        </button>
      </h3>
      <div hidden={!expanded} id={contentId}>
        <CompactContextList
          aria-label={listAriaLabel}
          className={listClassName}
        >
          {children}
        </CompactContextList>
      </div>
    </section>
  );
}
