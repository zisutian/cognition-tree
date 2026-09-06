// SPDX-License-Identifier: GPL-3.0-or-later

import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./primitives.tsx";

export type FieldControlAccessibility = Readonly<{
  "aria-describedby"?: string;
  "aria-invalid"?: true;
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
  description,
  errorMessage,
  fieldId,
  label,
}: {
  children(accessibility: FieldControlAccessibility): ReactNode;
  className?: string;
  description?: ReactNode;
  errorMessage?: ReactNode;
  fieldId: string;
  label: ReactNode;
}) {
  const hasError = errorMessage !== undefined;
  const descriptionId = description === undefined ? undefined : `${fieldId}-description`;
  const errorId = hasError ? `${fieldId}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ");

  return (
    <div className={cx("ui-field-row", className)}>
      <label className="ui-field-label" htmlFor={fieldId}>{label}</label>
      <div className="ui-field-control">
        {children({
          ...(describedBy ? { "aria-describedby": describedBy } : {}),
          ...(hasError ? { "aria-invalid": true } : {}),
          id: fieldId,
        })}
        {descriptionId ? (
          <p className="ui-field-description" id={descriptionId}>{description}</p>
        ) : null}
        {hasError ? (
          <p
            className="ui-field-description is-error"
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
