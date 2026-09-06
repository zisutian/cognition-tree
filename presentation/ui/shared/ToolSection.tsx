// SPDX-License-Identifier: GPL-3.0-or-later

import type { HTMLAttributes, ReactNode } from "react";
import { useId } from "react";
import { cx } from "./primitives.tsx";

export function ToolSectionStack({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("ui-tool-section-stack", className)} {...props} />;
}

export function ToolSection({
  actions,
  children,
  className,
  tone = "default",
  title,
  ...props
}: HTMLAttributes<HTMLElement> & {
    actions?: ReactNode;
    tone?: "danger" | "default";
    title?: ReactNode;
}) {
  const generatedHeadingId = useId();
  const labelledBy = title && !props["aria-label"] && !props["aria-labelledby"]
    ? generatedHeadingId
    : props["aria-labelledby"];

  return (
    <section
      className={cx(
        "ui-tool-section",
        tone === "danger" && "ui-tool-section-danger",
        className,
      )}
      {...props}
      aria-labelledby={labelledBy}
    >
      {title || actions ? (
        <header className="ui-tool-section-header">
          <div className="ui-tool-section-heading">
            {title ? <h3 id={generatedHeadingId}>{title}</h3> : null}
          </div>
          {actions ? (
            <div className="ui-tool-section-actions">{actions}</div>
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
