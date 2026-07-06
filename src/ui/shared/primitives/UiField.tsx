import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./classNames";

type UiFieldProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "label";
  hiddenLabel?: boolean;
  label: ReactNode;
};

type UiFormSectionProps = HTMLAttributes<HTMLElement> & {
  actions?: ReactNode;
  title: ReactNode;
};

export function UiField({
  as = "label",
  children,
  className,
  hiddenLabel = false,
  label,
  ...props
}: UiFieldProps) {
  const fieldClassName = cx(
    "ui-field",
    hiddenLabel && "ui-field-hidden-label",
    className,
  );
  const content = (
    <>
      <span className="ui-field-label">{label}</span>
      {children}
    </>
  );

  return as === "div" ? (
    <div className={fieldClassName} {...props}>
      {content}
    </div>
  ) : (
    <label className={fieldClassName} {...props}>
      {content}
    </label>
  );
}

export function UiFormSection({
  actions,
  children,
  className,
  title,
  ...props
}: UiFormSectionProps) {
  return (
    <section className={cx("ui-form-section", className)} {...props}>
      <div className="ui-form-section-header">
        <h3>{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}
