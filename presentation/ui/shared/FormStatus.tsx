// SPDX-License-Identifier: GPL-3.0-or-later

import { Button } from "compact-ui";

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
      >
        {busy ? "正在保存…" : saveLabel}
      </Button>
      <Button
        appearance="plain"
        disabled={busy || !canDiscard}
        onClick={onDiscard}
        type="button"
      >
        放弃修改
      </Button>
    </>
  );
}
