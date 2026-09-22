// SPDX-License-Identifier: GPL-3.0-or-later

import { Button, Toolbar } from "compact-ui";

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
    <Toolbar aria-label={`确认${label}`}>
      <Button
        disabled={disabled}
        onClick={onConfirm}
        type="button"
        tone="danger"
      >
        确认{label}
      </Button>
      <Button disabled={disabled} onClick={onCancel} type="button">
        取消
      </Button>
    </Toolbar>
  ) : (
    <Button disabled={disabled} onClick={onRequest} type="button" tone="danger">
      {label}
    </Button>
  );
}
