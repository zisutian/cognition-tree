// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  LiHTMLAttributes,
  ReactNode,
} from "react";
import { forwardRef, useId } from "react";
import { Panel, PanelBody, PanelHeader, cx } from "./primitives";

export function ToolPanel({
  actions,
  children,
  className,
  title,
  tone = "main",
  ...props
}: HTMLAttributes<HTMLElement> & {
  actions?: ReactNode;
  title: ReactNode;
  tone?: "detail" | "main";
}) {
  return (
    <Panel
      className={cx("ui-tool-panel", className)}
      tone={tone}
      {...props}
    >
      <PanelHeader actions={actions} title={title} />
      {children}
    </Panel>
  );
}

export type ToolPanelLayout = "form" | "results" | "table";

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
  description,
  title,
  ...props
}: HTMLAttributes<HTMLElement> & {
  actions?: ReactNode;
  description?: ReactNode;
  title?: ReactNode;
}) {
  const generatedHeadingId = useId();
  const labelledBy = title && !props["aria-label"] && !props["aria-labelledby"]
    ? generatedHeadingId
    : props["aria-labelledby"];

  return (
    <section
      className={cx("ui-tool-section", className)}
      {...props}
      aria-labelledby={labelledBy}
    >
      {title || description || actions ? (
        <header className="ui-tool-section-header">
          <div className="ui-tool-section-heading">
            {title ? <h3 id={generatedHeadingId}>{title}</h3> : null}
            {description ? <p>{description}</p> : null}
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

export function ToolToolbar({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx("ui-tool-toolbar", className)}
      role="group"
      {...props}
    />
  );
}

export function ToolDivider({
  className,
  ...props
}: HTMLAttributes<HTMLHRElement>) {
  return <hr className={cx("ui-tool-divider", className)} {...props} />;
}

export function ToolList({
  className,
  ...props
}: HTMLAttributes<HTMLUListElement>) {
  return <ul className={cx("ui-tool-list", className)} {...props} />;
}

type ToolListRowButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "className" | "onClick" | "type"
> & {
  [attribute: `data-${string}`]: string | number | undefined;
};

type ToolListRowCommonProps = Omit<
  LiHTMLAttributes<HTMLLIElement>,
  "children" | "onSelect"
> & {
  actions?: ReactNode;
  flow: "single-line" | "wrap";
  leading?: ReactNode;
  main: ReactNode;
  meta?: ReactNode;
};

type ToolListRowInteractionProps =
  | {
    buttonProps?: ToolListRowButtonProps;
    onSelect: () => void;
  }
  | {
    buttonProps?: never;
    onSelect?: never;
  };

export function ToolListRow({
  actions,
  buttonProps,
  className,
  flow,
  leading,
  main,
  meta,
  onSelect,
  ...props
}: ToolListRowCommonProps & ToolListRowInteractionProps) {
  const content = (
    <>
      <span className="ui-tool-list-row-leading">{leading}</span>
      <span className="ui-tool-list-row-main">{main}</span>
      <span className="ui-tool-list-row-meta">{meta}</span>
    </>
  );

  return (
    <li
      className={cx(
        "ui-tool-list-row-frame",
        `ui-tool-list-row-${flow}`,
        className,
      )}
      {...props}
    >
      {onSelect ? (
        <button
          className="ui-tool-list-row-target is-interactive"
          onClick={onSelect}
          type="button"
          {...buttonProps}
        >
          {content}
        </button>
      ) : (
        <div className="ui-tool-list-row-target">{content}</div>
      )}
      {actions ? (
        <div className="ui-tool-list-row-actions">{actions}</div>
      ) : null}
    </li>
  );
}
