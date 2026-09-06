// SPDX-License-Identifier: GPL-3.0-or-later

import type { HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";
import { Panel, PanelBody, PanelHeader, cx } from "./primitives.tsx";

export function ToolPanel({
  actions,
  children,
  className,
  title,
  ...props
}: HTMLAttributes<HTMLElement> & {
  actions?: ReactNode;
  title: ReactNode;
}) {
  return (
    <Panel
      className={cx("ui-tool-panel", className)}
      {...props}
    >
      <PanelHeader actions={actions} title={title} />
      {children}
    </Panel>
  );
}

export type ToolPanelLayout = "detail" | "form" | "results" | "table";

export const ToolPanelBody = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { layout: ToolPanelLayout }
>(function ToolPanelBody({ children, className, layout, ...props }, ref) {
  return (
    <PanelBody
      className={cx(
        "ui-tool-panel-body",
        `ui-tool-panel-body-${layout}`,
        className,
      )}
      data-tool-layout={layout}
      ref={ref}
      scroll
      {...props}
    >
      <div className="ui-tool-panel-content">{children}</div>
    </PanelBody>
  );
});
