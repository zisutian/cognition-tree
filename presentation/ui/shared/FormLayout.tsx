import styles from "./FormLayout.module.css";
// SPDX-License-Identifier: GPL-3.0-or-later

import type { HTMLAttributes, ReactNode } from "react";
import { cx as joinClasses } from "./classNames.ts";
import { ControlSizingContext } from "./ControlSizing.ts";

function cx(...names: Array<string | false | null | undefined>) {
  const tokens = joinClasses(...names).split(/\s+/);
  return joinClasses(...tokens, ...tokens.map((name) => styles[name]));
}

export type FieldControlAccessibility = Readonly<{
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-labelledby"?: string;
  id: string;
}>;

export function FormLayout({
  className,
  layout = "columns",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  layout?: "columns" | "stacked" | "compact";
}) {
  return (
    <ControlSizingContext value="container">
      <div
        className={cx("ui-form-layout", `ui-form-layout-${layout}`, className)}
        {...props}
      />
    </ControlSizingContext>
  );
}

export function FieldRow({
  children,
  className,
  controlKind = "field",
  errorMessage,
  fieldId,
  label,
}: {
  children(accessibility: FieldControlAccessibility): ReactNode;
  className?: string;
  controlKind?: "field" | "group";
  errorMessage?: ReactNode;
  fieldId: string;
  label: ReactNode;
}) {
  const hasError = errorMessage !== undefined;
  const errorId = hasError ? `${fieldId}-error` : undefined;

  return (
    <div className={cx("ui-field-row", className)}>
      {controlKind === "group" ? (
        <span className={cx("ui-field-label")} id={`${fieldId}-label`}>
          {label}
        </span>
      ) : (
        <label className={cx("ui-field-label")} htmlFor={fieldId}>
          {label}
        </label>
      )}
      <div className={cx("ui-field-control")}>
        {children({
          ...(errorId ? { "aria-describedby": errorId } : {}),
          ...(hasError ? { "aria-invalid": true } : {}),
          ...(controlKind === "group"
            ? { "aria-labelledby": `${fieldId}-label` }
            : {}),
          id: fieldId,
        })}
        {hasError ? (
          <p className={cx("ui-field-error")} id={errorId}>
            {errorMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function FormActions({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("ui-form-actions", className)} {...props} />;
}
