// SPDX-License-Identifier: GPL-3.0-or-later

import { Button } from "./primitives.tsx";

/** The caller owns the confirmation target and the actual operation. */
export function ConfirmAction({
  confirming,
  disabled,
  label,
  onCancel,
  onConfirm,
  onRequest,
}: {
  confirming: boolean;
  disabled: boolean;
  label: string;
  onCancel(): void;
  onConfirm(): void;
  onRequest(): void;
}) {
  return confirming ? (
    <span className="ui-actions" role="group" aria-label={`确认${label}`}>
      <Button
        disabled={disabled}
        onClick={onConfirm}
        type="button"
        variant="danger"
      >
        确认{label}
      </Button>
      <Button disabled={disabled} onClick={onCancel} type="button">
        取消
      </Button>
    </span>
  ) : (
    <Button
      disabled={disabled}
      onClick={onRequest}
      type="button"
      variant="danger"
    >
      {label}
    </Button>
  );
}
