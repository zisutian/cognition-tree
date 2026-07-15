import { createPortal } from "react-dom";
import {
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
} from "react";

export type ContextMenuItem = {
  disabled?: boolean;
  id: string;
  label: string;
  onSelect: () => void;
};

export type ContextMenuPosition = {
  x: number;
  y: number;
};

export function ContextMenu({
  ariaLabel,
  items,
  position,
  onClose,
}: {
  ariaLabel: string;
  items: ContextMenuItem[];
  position: ContextMenuPosition | null;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!position) {
      return undefined;
    }

    menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target)
      ) {
        onClose();
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, position]);

  if (!position) {
    return null;
  }

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ) ?? [],
    );

    if (items.length === 0) {
      return;
    }

    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex =
      (Math.max(currentIndex, 0) + direction + items.length) % items.length;

    event.preventDefault();
    items[nextIndex]?.focus();
  };
  const menu = (
    <div
      aria-label={ariaLabel}
      className="ui-context-menu"
      ref={menuRef}
      role="menu"
      style={{ left: position.x, top: position.y } as CSSProperties}
      onKeyDown={moveFocus}
    >
      {items.map((item) => (
        <button
          disabled={item.disabled}
          key={item.id}
          onClick={() => {
            item.onSelect();
            onClose();
          }}
          role="menuitem"
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );

  return typeof document === "undefined" ? menu : createPortal(menu, document.body);
}
