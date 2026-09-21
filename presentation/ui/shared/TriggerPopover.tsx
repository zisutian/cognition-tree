import { Popover as Surface } from "compact-ui";
import { useId, useRef, useState, type ReactNode, type RefObject } from "react";
/** Own only the trigger's transient open state. */
export function TriggerPopover({
  ariaLabel,
  children,
  renderTrigger,
}: {
  ariaLabel: string;
  children(controls: { close(): void }): ReactNode;
  renderTrigger(controls: {
    isOpen: boolean;
    panelId: string;
    toggle(): void;
    triggerRef: RefObject<HTMLButtonElement | null>;
  }): ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const id = useId();
  return (
    <>
      {renderTrigger({
        isOpen: open,
        panelId: id,
        toggle: () => setOpen((value) => !value),
        triggerRef,
      })}
      <Surface
        open={open}
        anchorRef={triggerRef}
        label={ariaLabel}
        onClose={() => setOpen(false)}
      >
        <div id={id}>{children({ close: () => setOpen(false) })}</div>
      </Surface>
    </>
  );
}
