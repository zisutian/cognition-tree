import { useId, useRef } from "react";
import { Overlay } from "./Overlay";
import { Button } from "./primitives";

export function ConfirmDialog({
  confirmLabel = "确认",
  description,
  open,
  title,
  onCancel,
  onConfirm,
}: {
  confirmLabel?: string;
  description: string;
  open: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  if (!open) {
    return null;
  }

  return (
    <Overlay
      ariaDescribedBy={descriptionId}
      ariaLabelledBy={titleId}
      backdropClassName="ui-overlay-backdrop"
      className="ui-dialog"
      initialFocusRef={cancelRef}
      modal
      role="alertdialog"
      trapFocus
      onDismiss={onCancel}
    >
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>{description}</p>
      <div className="ui-dialog-actions">
        <Button
          onClick={onCancel}
          ref={cancelRef}
          type="button"
          variant="secondary"
        >
          取消
        </Button>
        <Button
          className="ui-button-danger"
          onClick={onConfirm}
          type="button"
          variant="secondary"
        >
          {confirmLabel}
        </Button>
      </div>
    </Overlay>
  );
}
