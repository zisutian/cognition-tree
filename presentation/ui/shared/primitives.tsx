import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from "react";
import { forwardRef } from "react";
import { ChevronRight } from "lucide-react";

export function cx(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

type PanelProps = HTMLAttributes<HTMLElement> & {
  tone?: "detail" | "main";
};

export function Panel({
  children,
  className,
  tone = "main",
  ...props
}: PanelProps) {
  return (
    <section className={cx("ui-panel", `ui-panel-${tone}`, className)} {...props}>
      {children}
    </section>
  );
}

export function PanelHeader({
  actions,
  className,
  title,
  ...props
}: HTMLAttributes<HTMLElement> & {
  actions?: ReactNode;
  title: ReactNode;
}) {
  return (
    <header className={cx("ui-panel-header", className)} {...props}>
      <h2>{title}</h2>
      {actions ? <div className="ui-actions">{actions}</div> : null}
    </header>
  );
}

export function DetailPanel({
  actions,
  children,
  className,
  collapseLabel = "收回右侧详情",
  onCollapse,
  title,
  ...props
}: HTMLAttributes<HTMLElement> & {
  actions?: ReactNode;
  collapseLabel?: string;
  onCollapse: () => void;
  title: ReactNode;
}) {
  return (
    <Panel className={className} tone="detail" {...props}>
      <PanelHeader
        actions={(
          <>
            {actions}
            <Button
              aria-label={collapseLabel}
              onClick={onCollapse}
              title={collapseLabel}
              type="button"
              variant="icon"
            >
              <ChevronRight aria-hidden="true" size={14} />
            </Button>
          </>
        )}
        title={title}
      />
      {children}
    </Panel>
  );
}

type PanelBodyProps = HTMLAttributes<HTMLDivElement> & {
  scroll?: boolean;
};

export const PanelBody = forwardRef<HTMLDivElement, PanelBodyProps>(
  function PanelBody({
    children,
    className,
    scroll = false,
    ...props
  }, ref) {
    return (
      <div
        className={cx(
          "ui-panel-body",
          scroll && "ui-panel-body-scroll ui-scroll-surface",
          className,
        )}
        ref={ref}
        {...props}
      >
        {children}
      </div>
    );
  },
);

export function Section({
  children,
  className,
  title,
  ...props
}: HTMLAttributes<HTMLElement> & {
  title?: ReactNode;
}) {
  return (
    <section className={cx("ui-section", className)} {...props}>
      {title ? <p className="ui-section-title">{title}</p> : null}
      {children}
    </section>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "bare" | "danger" | "ghost" | "icon" | "primary" | "secondary";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant = "secondary", ...props }, ref) {
    return (
      <button
        className={cx("ui-button", `ui-button-${variant}`, className)}
        ref={ref}
        {...props}
      />
    );
  },
);

export function ToggleButton({
  className,
  pressed,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> & {
  pressed: boolean;
}) {
  return (
    <button
      aria-pressed={pressed}
      className={cx("ui-toggle-button", pressed && "is-active", className)}
      type="button"
      {...props}
    />
  );
}

export function SymbolSlot({
  children,
  className,
  tone = "muted",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "danger" | "link" | "muted" | "strong" | "warning";
}) {
  return (
    <span
      className={cx("ui-symbol-slot", `ui-symbol-slot-${tone}`, className)}
      {...props}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  action,
  compact = false,
  description,
  title,
}: {
  action?: ReactNode;
  compact?: boolean;
  description?: ReactNode;
  title: ReactNode;
}) {
  return (
    <div className={cx("ui-empty-state", compact && "is-compact")}>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {action ? <div className="ui-empty-actions">{action}</div> : null}
    </div>
  );
}
