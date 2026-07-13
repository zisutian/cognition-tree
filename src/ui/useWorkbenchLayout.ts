import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  appContextDefaultWidth,
  appDetailDefaultWidth,
  clampAppContextWidth,
  clampAppDetailWidth,
  getAppContextKeyboardResizeWidth,
  getAppDetailKeyboardResizeWidth,
} from "./frameResize";

export type WorkbenchLayout = {
  contextCollapsed: boolean;
  contextResizeValue: number;
  contextWidth: number | null;
  detailCollapsed: boolean;
  detailResizeValue: number;
  detailWidth: number | null;
  isContextResizing: boolean;
  isDetailResizing: boolean;
  onContextResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onContextResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
  onDetailResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onDetailResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
  onDetailToggle: () => void;
};

export function useWorkbenchLayout() {
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [contextWidth, setContextWidth] = useState<number | null>(null);
  const [detailWidth, setDetailWidth] = useState<number | null>(null);
  const [isContextResizing, setIsContextResizing] = useState(false);
  const [isDetailResizing, setIsDetailResizing] = useState(false);
  const removeResizeListenersRef = useRef<(() => void) | null>(null);
  const contextResizeValue = contextWidth ?? appContextDefaultWidth;
  const detailResizeValue = detailWidth ?? appDetailDefaultWidth;

  const removeResizeListeners = useCallback(() => {
    removeResizeListenersRef.current?.();
    removeResizeListenersRef.current = null;
  }, []);

  useEffect(() => () => removeResizeListeners(), [removeResizeListeners]);

  const startContextResize = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || contextCollapsed) {
      return;
    }

    event.preventDefault();
    removeResizeListeners();
    const startX = event.clientX;
    const startWidth = clampAppContextWidth(
      event.currentTarget.closest(".app-context")?.getBoundingClientRect().width ??
        contextResizeValue,
    );

    setContextWidth(startWidth);
    setIsContextResizing(true);

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      moveEvent.preventDefault();
      setContextWidth(
        clampAppContextWidth(startWidth + moveEvent.clientX - startX),
      );
    };
    const handlePointerEnd = () => {
      removeResizeListeners();
      setIsContextResizing(false);
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerEnd);
    document.addEventListener("pointercancel", handlePointerEnd);
    removeResizeListenersRef.current = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerEnd);
      document.removeEventListener("pointercancel", handlePointerEnd);
    };
  };
  const startDetailResize = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || detailCollapsed) {
      return;
    }

    event.preventDefault();
    removeResizeListeners();
    const startX = event.clientX;
    const startWidth = clampAppDetailWidth(
      event.currentTarget.closest(".app-detail")?.getBoundingClientRect().width ??
        detailResizeValue,
    );

    setDetailWidth(startWidth);
    setIsDetailResizing(true);

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      moveEvent.preventDefault();
      setDetailWidth(
        clampAppDetailWidth(startWidth + startX - moveEvent.clientX),
      );
    };
    const handlePointerEnd = () => {
      removeResizeListeners();
      setIsDetailResizing(false);
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerEnd);
    document.addEventListener("pointercancel", handlePointerEnd);
    removeResizeListenersRef.current = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerEnd);
      document.removeEventListener("pointercancel", handlePointerEnd);
    };
  };
  const resizeContextByKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const nextWidth = getAppContextKeyboardResizeWidth(
      contextResizeValue,
      event.key,
    );

    if (nextWidth !== null) {
      event.preventDefault();
      setContextWidth(nextWidth);
    }
  };
  const resizeDetailByKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const nextWidth = getAppDetailKeyboardResizeWidth(
      detailResizeValue,
      event.key,
    );

    if (nextWidth !== null) {
      event.preventDefault();
      setDetailWidth(nextWidth);
    }
  };
  const expandPanels = () => {
    setContextCollapsed(false);
    setDetailCollapsed(false);
  };

  const layout: WorkbenchLayout = {
    contextCollapsed,
    contextResizeValue,
    contextWidth,
    detailCollapsed,
    detailResizeValue,
    detailWidth,
    isContextResizing,
    isDetailResizing,
    onContextResizeKeyDown: resizeContextByKeyboard,
    onContextResizeStart: startContextResize,
    onDetailResizeKeyDown: resizeDetailByKeyboard,
    onDetailResizeStart: startDetailResize,
    onDetailToggle: () => setDetailCollapsed((current) => !current),
  };

  return {
    collapseDetail: () => setDetailCollapsed(true),
    expandPanels,
    layout,
    toggleContext: () => setContextCollapsed((current) => !current),
  };
}
