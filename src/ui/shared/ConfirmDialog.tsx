import { useEffect, useId, useRef } from "react";
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
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    cancelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ) ?? [],
      );

      if (focusable.length === 0) {
        return;
      }

      const activeIndex = focusable.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const nextIndex = event.shiftKey
        ? (activeIndex - 1 + focusable.length) % focusable.length
        : (activeIndex + 1) % focusable.length;

      if (
        activeIndex < 0 ||
        (event.shiftKey && activeIndex === 0) ||
        (!event.shiftKey && activeIndex === focusable.length - 1)
      ) {
        event.preventDefault();
        focusable[activeIndex < 0 ? 0 : nextIndex]?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="ui-overlay-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="ui-dialog"
        ref={dialogRef}
        role="alertdialog"
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
      </div>
    </div>
  );
}
