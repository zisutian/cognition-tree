import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Overlay, type OverlayAnchorAlign } from "./Overlay.tsx";

const focusableSelector = [
  "button:not(:disabled)",
  "input:not(:disabled)",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

type PopoverTriggerControls = {
  isOpen: boolean;
  panelId: string;
  toggle: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
};

export function Popover({
  ariaLabel,
  align = "end",
  children,
  className,
  panelClassName,
  panelRole,
  renderTrigger,
}: {
  ariaLabel: string;
  align?: OverlayAnchorAlign;
  children: (controls: { close: () => void }) => ReactNode;
  className: string;
  panelClassName: string;
  panelRole: "dialog" | "listbox";
  renderTrigger: (controls: PopoverTriggerControls) => ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const close = () => {
    setIsOpen(false);
  };
  const toggle = () => setIsOpen((current) => !current);
  const movePanelFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!panelRef.current || event.target instanceof HTMLInputElement) {
      return;
    }

    const items = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(focusableSelector),
    );

    if (items.length === 0) {
      return;
    }

    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    let nextIndex: number | null = null;

    if (event.key === "ArrowDown") {
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
    } else if (event.key === "ArrowUp") {
      nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = items.length - 1;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      items[nextIndex]?.focus();
    }
  };

  return (
    <div className={className}>
      {renderTrigger({ isOpen, panelId, toggle, triggerRef })}
      {isOpen ? (
        <Overlay
          ariaLabel={ariaLabel}
          className={panelClassName}
          id={panelId}
          role={panelRole}
          outsideRefs={[triggerRef]}
          position={{ align, anchorRef: triggerRef, kind: "anchor" }}
          restoreFocusRef={triggerRef}
          surfaceRef={panelRef}
          onDismiss={close}
          onKeyDown={movePanelFocus}
        >
          {children({ close })}
        </Overlay>
      ) : null}
    </div>
  );
}
