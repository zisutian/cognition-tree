import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  clampAppContextWidth,
  clampAppDetailWidth,
  clampAppProblemsHeight,
  getAppContextKeyboardResizeWidth,
  getAppDetailKeyboardResizeWidth,
  getAppProblemsKeyboardResizeHeight,
} from "./frameResize";

type WidthSetter = (width: number) => void;

type HorizontalPanelResizeSource = {
  collapsed: boolean;
  resizeValue: number;
  setWidth: WidthSetter;
};

type ProblemsPanelResizeSource = {
  expanded: boolean;
  resizeValue: number;
  setHeight: (height: number) => void;
};

export type WorkbenchPanelResizeController = {
  isContextResizing: boolean;
  isDetailResizing: boolean;
  isProblemsResizing: boolean;
  onContextResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onContextResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
  onDetailResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onDetailResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
  onProblemsResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onProblemsResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
};

export function useWorkbenchPanelResize({
  context,
  detail,
  problems,
}: {
  context: HorizontalPanelResizeSource;
  detail: HorizontalPanelResizeSource;
  problems: ProblemsPanelResizeSource;
}): WorkbenchPanelResizeController {
  const [isContextResizing, setIsContextResizing] = useState(false);
  const [isDetailResizing, setIsDetailResizing] = useState(false);
  const [isProblemsResizing, setIsProblemsResizing] = useState(false);
  const activeResizeRef = useRef<{
    detach: () => void;
    setResizing: (resizing: boolean) => void;
  } | null>(null);

  const stopResize = useCallback((resetState = true) => {
    const activeResize = activeResizeRef.current;

    activeResizeRef.current = null;
    activeResize?.detach();
    if (resetState) {
      activeResize?.setResizing(false);
    }
  }, []);

  useEffect(() => () => stopResize(false), [stopResize]);

  const startHorizontalResize = ({
    clampWidth,
    direction,
    event,
    panelSelector,
    source,
    setResizing,
  }: {
    clampWidth: (width: number) => number;
    direction: 1 | -1;
    event: PointerEvent<HTMLDivElement>;
    panelSelector: string;
    source: HorizontalPanelResizeSource;
    setResizing: (resizing: boolean) => void;
  }) => {
    if (event.button !== 0 || source.collapsed) {
      return;
    }

    event.preventDefault();
    stopResize();
    const startX = event.clientX;
    const startWidth = clampWidth(
      event.currentTarget.closest(panelSelector)?.getBoundingClientRect().width ??
        source.resizeValue,
    );

    source.setWidth(startWidth);
    setResizing(true);

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      moveEvent.preventDefault();
      source.setWidth(
        clampWidth(startWidth + direction * (moveEvent.clientX - startX)),
      );
    };
    const handlePointerEnd = () => {
      stopResize();
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerEnd);
    document.addEventListener("pointercancel", handlePointerEnd);
    activeResizeRef.current = {
      detach: () => {
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerEnd);
        document.removeEventListener("pointercancel", handlePointerEnd);
      },
      setResizing,
    };
  };
  const resizeWidthByKeyboard = (
    event: KeyboardEvent<HTMLDivElement>,
    resizeValue: number,
    resolveWidth: (currentWidth: number, key: string) => number | null,
    setWidth: WidthSetter,
  ) => {
    const nextWidth = resolveWidth(resizeValue, event.key);

    if (nextWidth !== null) {
      event.preventDefault();
      setWidth(nextWidth);
    }
  };
  const startProblemsResize = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !problems.expanded) {
      return;
    }

    event.preventDefault();
    stopResize();
    const startY = event.clientY;
    const startHeight = clampAppProblemsHeight(
      event.currentTarget.closest(".app-problems")?.getBoundingClientRect()
        .height ?? problems.resizeValue,
    );

    problems.setHeight(startHeight);
    setIsProblemsResizing(true);

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      moveEvent.preventDefault();
      problems.setHeight(
        clampAppProblemsHeight(startHeight - (moveEvent.clientY - startY)),
      );
    };
    const handlePointerEnd = () => {
      stopResize();
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerEnd);
    document.addEventListener("pointercancel", handlePointerEnd);
    activeResizeRef.current = {
      detach: () => {
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerEnd);
        document.removeEventListener("pointercancel", handlePointerEnd);
      },
      setResizing: setIsProblemsResizing,
    };
  };

  return {
    isContextResizing,
    isDetailResizing,
    isProblemsResizing,
    onContextResizeKeyDown: (event) =>
      resizeWidthByKeyboard(
        event,
        context.resizeValue,
        getAppContextKeyboardResizeWidth,
        context.setWidth,
      ),
    onContextResizeStart: (event) =>
      startHorizontalResize({
        clampWidth: clampAppContextWidth,
        direction: 1,
        event,
        panelSelector: ".app-context",
        setResizing: setIsContextResizing,
        source: context,
      }),
    onDetailResizeKeyDown: (event) =>
      resizeWidthByKeyboard(
        event,
        detail.resizeValue,
        getAppDetailKeyboardResizeWidth,
        detail.setWidth,
      ),
    onDetailResizeStart: (event) =>
      startHorizontalResize({
        clampWidth: clampAppDetailWidth,
        direction: -1,
        event,
        panelSelector: ".app-detail",
        setResizing: setIsDetailResizing,
        source: detail,
      }),
    onProblemsResizeKeyDown: (event) => {
      const nextHeight = getAppProblemsKeyboardResizeHeight(
        problems.resizeValue,
        event.key,
      );

      if (nextHeight !== null) {
        event.preventDefault();
        problems.setHeight(nextHeight);
      }
    },
    onProblemsResizeStart: startProblemsResize,
  };
}
