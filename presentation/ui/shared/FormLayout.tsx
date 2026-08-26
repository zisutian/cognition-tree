// SPDX-License-Identifier: GPL-3.0-or-later

import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./primitives";

export type FieldControlAccessibility = Readonly<{
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  id: string;
}>;

export function FormLayout({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("ui-form-layout", className)} {...props} />;
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
  const hasDescription = description !== undefined ||
    errorMessage !== undefined;
  const hasError = errorMessage !== undefined;
  const descriptionId = hasDescription
    ? `${fieldId}-description`
    : undefined;

  return (
    <div className={cx("ui-field-row", className)}>
      <label className="ui-field-label" htmlFor={fieldId}>{label}</label>
      <div className="ui-field-control">
        {children({
          ...(descriptionId ? { "aria-describedby": descriptionId } : {}),
          ...(hasError ? { "aria-invalid": true } : {}),
          id: fieldId,
        })}
        {hasDescription ? (
          <p
            className={cx(
              "ui-field-description",
              hasError && "is-error",
            )}
            id={descriptionId}
          >
            {hasError ? errorMessage : description}
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
