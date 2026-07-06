import { isValidElement } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./classNames";

type UiPanelElement = "aside" | "section";
type UiPanelVariant = "detail" | "editor" | "main" | "outline";

type UiPanelProps = HTMLAttributes<HTMLElement> & {
  as?: UiPanelElement;
  centered?: boolean;
  fullWidth?: boolean;
  variant: UiPanelVariant;
};

type UiPanelHeaderProps = HTMLAttributes<HTMLElement> & {
  actions?: ReactNode;
  leadingActions?: ReactNode;
  stats?: ReactNode[];
  title: ReactNode;
};

export function UiPanel({
  as = "section",
  centered = false,
  children,
  className,
  fullWidth = false,
  variant,
  ...props
}: UiPanelProps) {
  const panelClassName = cx(
    "ui-panel",
    `ui-panel-${variant}`,
    fullWidth && "ui-panel-full-width",
    centered && "ui-panel-centered",
    className,
  );

  if (as === "aside") {
    return (
      <aside className={panelClassName} {...props}>
        {children}
      </aside>
    );
  }

  return (
    <section className={panelClassName} {...props}>
      {children}
    </section>
  );
}

export function UiPanelHeader({
  actions,
  className,
  leadingActions,
  stats,
  title,
  ...props
}: UiPanelHeaderProps) {
  return (
    <header className={cx("ui-panel-header", className)} {...props}>
      <div className="ui-panel-title-group">
        {leadingActions ? (
          <div className="ui-panel-leading-actions">{leadingActions}</div>
        ) : null}
        <div className="ui-panel-title">
          <h2>{title}</h2>
        </div>
      </div>
      {stats ? (
        <div className="ui-panel-stats">
          {stats.map((stat, index) =>
            isValidElement(stat) ? stat : <span key={index}>{stat}</span>,
          )}
        </div>
      ) : null}
      {actions ? <div className="ui-panel-actions">{actions}</div> : null}
    </header>
  );
}

export function UiPanelBody({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("ui-panel-body", className)} {...props}>
      {children}
    </div>
  );
}

export function UiSection({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <section className={cx("ui-section", className)} {...props}>
      {children}
    </section>
  );
}

export function UiSectionTitle({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cx("ui-section-title", className)} {...props}>
      {children}
    </p>
  );
}
