import {
  useEffect,
  useRef,
  useState,
  type AriaRole,
  type CSSProperties,
  type KeyboardEventHandler,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

const focusableSelector = [
  "button:not(:disabled)",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const overlayStack: symbol[] = [];
const overlayViewportMargin = 8;

export type OverlayAnchorAlign = "center" | "end" | "start";

export type OverlayPosition =
  | { kind: "anchor"; align?: OverlayAnchorAlign; anchorRef: RefObject<HTMLElement | null> }
  | { kind: "point"; x: number; y: number };

export function resolveOverlayCoordinates({
  anchorRect,
  align = "start",
  panelHeight,
  panelWidth,
  point,
  viewportHeight,
  viewportWidth,
}: {
  anchorRect?: Pick<DOMRect, "bottom" | "left" | "right" | "top" | "width">;
  align?: OverlayAnchorAlign;
  panelHeight: number;
  panelWidth: number;
  point?: { x: number; y: number };
  viewportHeight: number;
  viewportWidth: number;
}) {
  const maxLeft = Math.max(
    overlayViewportMargin,
    viewportWidth - panelWidth - overlayViewportMargin,
  );
  const maxTop = Math.max(
    overlayViewportMargin,
    viewportHeight - panelHeight - overlayViewportMargin,
  );

  if (point) {
    return {
      left: Math.min(maxLeft, Math.max(overlayViewportMargin, point.x)),
      top: Math.min(maxTop, Math.max(overlayViewportMargin, point.y)),
    };
  }

  if (!anchorRect) {
    return { left: overlayViewportMargin, top: overlayViewportMargin };
  }

  const desiredLeft =
    align === "end"
      ? anchorRect.right - panelWidth
      : align === "center"
        ? anchorRect.left + anchorRect.width / 2 - panelWidth / 2
        : anchorRect.left;
  const spaceBelow = viewportHeight - anchorRect.bottom;
  const desiredTop =
    spaceBelow >= panelHeight + overlayViewportMargin ||
    spaceBelow >= anchorRect.top
      ? anchorRect.bottom + overlayViewportMargin / 2
      : anchorRect.top - panelHeight - overlayViewportMargin / 2;

  return {
    left: Math.min(maxLeft, Math.max(overlayViewportMargin, desiredLeft)),
    top: Math.min(maxTop, Math.max(overlayViewportMargin, desiredTop)),
  };
}

function getFocusableElements(panel: HTMLElement | null) {
  return Array.from(
    panel?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
  ).filter((element) => element.getAttribute("aria-hidden") !== "true");
}

export function Overlay({
  ariaDescribedBy,
  ariaLabel,
  ariaLabelledBy,
  backdropClassName,
  children,
  className,
  initialFocusRef,
  id,
  modal = false,
  outsideRefs = [],
  position,
  restoreFocusRef,
  role,
  surfaceRef,
  trapFocus = false,
  onDismiss,
  onKeyDown,
}: {
  ariaDescribedBy?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  backdropClassName?: string;
  children: ReactNode;
  className: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  id?: string;
  modal?: boolean;
  outsideRefs?: Array<RefObject<HTMLElement | null>>;
  position?: OverlayPosition;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  role: AriaRole;
  surfaceRef?: RefObject<HTMLDivElement | null>;
  trapFocus?: boolean;
  onDismiss: () => void;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const overlayIdRef = useRef(Symbol("overlay"));
  const onDismissRef = useRef(onDismiss);
  const outsideRefsRef = useRef(outsideRefs);
  const trapFocusRef = useRef(trapFocus);
  const [positionStyle, setPositionStyle] = useState<CSSProperties>();

  onDismissRef.current = onDismiss;
  outsideRefsRef.current = outsideRefs;
  trapFocusRef.current = trapFocus;

  useEffect(() => {
    const overlayId = overlayIdRef.current;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    overlayStack.push(overlayId);

    const isTopOverlay = () => overlayStack.at(-1) === overlayId;
    const focusFirst = () => {
      const target =
        initialFocusRef?.current ??
        getFocusableElements(panelRef.current)[0] ??
        panelRef.current;

      target?.focus();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!isTopOverlay() || !(event.target instanceof Node)) {
        return;
      }

      const target = event.target;

      if (
        panelRef.current?.contains(target) ||
        outsideRefsRef.current.some((ref) => ref.current?.contains(target))
      ) {
        return;
      }

      onDismissRef.current();
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!isTopOverlay()) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onDismissRef.current();
        return;
      }

      if (event.key !== "Tab" || !trapFocusRef.current) {
        return;
      }

      const focusable = getFocusableElements(panelRef.current);

      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }

      const activeIndex = focusable.indexOf(
        document.activeElement as HTMLElement,
      );

      if (
        activeIndex < 0 ||
        (event.shiftKey && activeIndex === 0) ||
        (!event.shiftKey && activeIndex === focusable.length - 1)
      ) {
        event.preventDefault();
        focusable[event.shiftKey ? focusable.length - 1 : 0]?.focus();
      }
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (
        isTopOverlay() &&
        trapFocusRef.current &&
        event.target instanceof Node &&
        !panelRef.current?.contains(event.target)
      ) {
        focusFirst();
      }
    };

    focusFirst();
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", handleFocusIn, true);

    return () => {
      const index = overlayStack.lastIndexOf(overlayId);

      if (index >= 0) {
        overlayStack.splice(index, 1);
      }

      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", handleFocusIn, true);

      const restoreTarget = restoreFocusRef?.current ?? previousFocusRef.current;

      if (restoreTarget?.isConnected) {
        restoreTarget.focus();
      }
    };
  }, [initialFocusRef, restoreFocusRef]);

  useEffect(() => {
    if (!position) {
      setPositionStyle(undefined);
      return undefined;
    }

    const updatePosition = () => {
      const panel = panelRef.current;

      if (!panel) {
        return;
      }

      const rect = panel.getBoundingClientRect();
      const coordinates = resolveOverlayCoordinates({
        anchorRect:
          position.kind === "anchor"
            ? position.anchorRef.current?.getBoundingClientRect()
            : undefined,
        align: position.kind === "anchor" ? position.align : undefined,
        panelHeight: rect.height,
        panelWidth: rect.width,
        point: position.kind === "point" ? position : undefined,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      });

      setPositionStyle((current) =>
        current?.left === coordinates.left && current.top === coordinates.top
          ? current
          : coordinates,
      );
    };

    updatePosition();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updatePosition);

    if (panelRef.current) {
      resizeObserver?.observe(panelRef.current);
    }

    if (position.kind === "anchor" && position.anchorRef.current) {
      resizeObserver?.observe(position.anchorRef.current);
    }

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [
    position?.kind,
    position?.kind === "anchor" ? position.align : undefined,
    position?.kind === "anchor" ? position.anchorRef : undefined,
    position?.kind === "point" ? position.x : undefined,
    position?.kind === "point" ? position.y : undefined,
  ]);

  const panel = (
    <div
      aria-describedby={ariaDescribedBy}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-modal={modal || undefined}
      className={className}
      id={id}
      ref={(element) => {
        panelRef.current = element;

        if (surfaceRef) {
          surfaceRef.current = element;
        }
      }}
      role={role}
      style={positionStyle}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
  const content = backdropClassName ? (
    <div className={backdropClassName}>{panel}</div>
  ) : panel;

  return typeof document === "undefined"
    ? content
    : createPortal(content, document.body);
}
