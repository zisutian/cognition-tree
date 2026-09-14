// SPDX-License-Identifier: GPL-3.0-or-later

import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./primitives.tsx";

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
}: HTMLAttributes<HTMLDivElement> & { layout?: "columns" | "stacked" }) {
  return (
    <div
      className={cx("ui-form-layout", `ui-form-layout-${layout}`, className)}
      {...props}
    />
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
      {controlKind === "group"
        ? <span className="ui-field-label" id={`${fieldId}-label`}>{label}</span>
        : <label className="ui-field-label" htmlFor={fieldId}>{label}</label>}
      <div className="ui-field-control">
        {children({
          ...(errorId ? { "aria-describedby": errorId } : {}),
          ...(hasError ? { "aria-invalid": true } : {}),
          ...(controlKind === "group" ? { "aria-labelledby": `${fieldId}-label` } : {}),
          id: fieldId,
        })}
        {hasError ? (
          <p
            className="ui-field-error"
            id={errorId}
          >
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
