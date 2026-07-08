import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from "react";

export function cx(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

type PanelProps = HTMLAttributes<HTMLElement> & {
  as?: "aside" | "section";
  tone?: "detail" | "main";
};

export function Panel({
  as = "section",
  children,
  className,
  tone = "main",
  ...props
}: PanelProps) {
  const Component = as;

  return (
    <Component className={cx("ui-panel", `ui-panel-${tone}`, className)} {...props}>
      {children}
    </Component>
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

export function PanelBody({
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

export function Button({
  className,
  variant = "secondary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "ghost" | "icon" | "primary" | "secondary";
}) {
  return (
    <button className={cx("ui-button", `ui-button-${variant}`, className)} {...props} />
  );
}

export function Field({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: ReactNode;
}) {
  return (
    <label className={cx("ui-field", className)}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Metrics({
  items,
  ...props
}: HTMLAttributes<HTMLDListElement> & {
  items: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <dl className="ui-metrics" {...props}>
      {items.map((item) => (
        <div className="ui-metric" key={item.label}>
          <dd>{item.value}</dd>
          <dt>{item.label}</dt>
        </div>
      ))}
    </dl>
  );
}

export function EmptyState({
  action,
  description,
  title,
}: {
  action?: ReactNode;
  description: ReactNode;
  title: ReactNode;
}) {
  return (
    <div className="ui-empty-state">
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div className="ui-empty-actions">{action}</div> : null}
    </div>
  );
}

export function StatusLine({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "error" | "neutral" | "success";
}) {
  return <div className={`ui-status ui-status-${tone}`}>{children}</div>;
}
