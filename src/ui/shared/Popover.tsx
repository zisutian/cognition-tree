import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

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
  children,
  className,
  panelClassName,
  panelRole,
  renderTrigger,
}: {
  ariaLabel: string;
  children: (controls: { close: () => void }) => ReactNode;
  className: string;
  panelClassName: string;
  panelRole: "dialog" | "listbox";
  renderTrigger: (controls: PopoverTriggerControls) => ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    panelRef.current?.querySelector<HTMLElement>(focusableSelector)?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const close = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
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
    <div className={className} ref={containerRef}>
      {renderTrigger({ isOpen, panelId, toggle, triggerRef })}
      {isOpen ? (
        <div
          aria-label={ariaLabel}
          className={panelClassName}
          id={panelId}
          ref={panelRef}
          role={panelRole}
          onKeyDown={movePanelFocus}
        >
          {children({ close })}
        </div>
      ) : null}
    </div>
  );
}
