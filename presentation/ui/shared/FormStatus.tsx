// SPDX-License-Identifier: GPL-3.0-or-later

import { Button, StatusText } from "compact-ui";

export function FormSaveActions({
  busy,
  canDiscard,
  canSave,
  formId,
  onDiscard,
  saveLabel = "保存",
}: {
  busy: boolean;
  canDiscard: boolean;
  canSave: boolean;
  formId: string;
  onDiscard(): void;
  saveLabel?: string;
}) {
  return (
    <>
      <Button
        aria-label={saveLabel}
        disabled={busy || !canSave}
        form={formId}
        type="submit"
        variant="normal"
      >
        {busy ? "正在保存…" : saveLabel}
      </Button>
      <Button disabled={busy || !canDiscard} onClick={onDiscard} type="button">
        放弃修改
      </Button>
    </>
  );
}

export function FormError({ message }: { message: string | null | undefined }) {
  return message ? (
    <div role="alert">
      <StatusText mode="live" tone="danger">
        {message}
      </StatusText>
    </div>
  ) : null;
}
