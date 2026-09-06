import { Button } from "./primitives.tsx";
import { useRef, type KeyboardEvent } from "react";
import { Overlay } from "./Overlay.tsx";

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
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  if (!position) {
    return null;
  }

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    const items = itemRefs.current.filter(
      (item): item is HTMLButtonElement => Boolean(item && !item.disabled),
    );

    if (items.length === 0) {
      return;
    }

    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = currentIndex < 0
      ? direction > 0 ? 0 : items.length - 1
      : (currentIndex + direction + items.length) % items.length;

    event.preventDefault();
    items[nextIndex]?.focus();
  };
  return (
    <Overlay
      ariaLabel={ariaLabel}
      className="ui-context-menu"
      role="menu"
      position={{ kind: "point", ...position }}
      onDismiss={onClose}
      onKeyDown={moveFocus}
    >
      {items.map((item, index) => (
        <Button variant="bare"
          disabled={item.disabled}
          key={item.id}
          onClick={() => {
            item.onSelect();
            onClose();
          }}
          ref={(element) => {
            itemRefs.current[index] = element;
          }}
          role="menuitem"
          type="button"
        >
          {item.label}
        </Button>
      ))}
    </Overlay>
  );
}
