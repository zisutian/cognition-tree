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
import {
  loadRepositoryContextWidth,
  saveRepositoryContextWidth,
} from "./workbenchLayoutStorage";

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

export function useWorkbenchLayout(repositoryId: string) {
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [contextWidth, setContextWidth] = useState<number | null>(() =>
    loadRepositoryContextWidth(repositoryId),
  );
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

  useEffect(() => {
    setContextWidth(loadRepositoryContextWidth(repositoryId));
  }, [repositoryId]);

  useEffect(() => {
    if (contextWidth !== null) {
      saveRepositoryContextWidth(repositoryId, contextWidth);
    }
  }, [contextWidth, repositoryId]);

  const startPanelResize = ({
    clampWidth,
    collapsed,
    direction,
    event,
    panelSelector,
    resizeValue,
    setResizing,
    setWidth,
  }: {
    clampWidth: (width: number) => number;
    collapsed: boolean;
    direction: 1 | -1;
    event: PointerEvent<HTMLDivElement>;
    panelSelector: string;
    resizeValue: number;
    setResizing: (resizing: boolean) => void;
    setWidth: (width: number) => void;
  }) => {
    if (event.button !== 0 || collapsed) {
      return;
    }

    event.preventDefault();
    removeResizeListeners();
    const startX = event.clientX;
    const startWidth = clampWidth(
      event.currentTarget.closest(panelSelector)?.getBoundingClientRect().width ??
        resizeValue,
    );

    setWidth(startWidth);
    setResizing(true);

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      moveEvent.preventDefault();
      setWidth(
        clampWidth(
          startWidth + direction * (moveEvent.clientX - startX),
        ),
      );
    };
    const handlePointerEnd = () => {
      removeResizeListeners();
      setResizing(false);
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
  const resizePanelByKeyboard = (
    event: KeyboardEvent<HTMLDivElement>,
    resizeValue: number,
    resolveWidth: (currentWidth: number, key: string) => number | null,
    setWidth: (width: number) => void,
  ) => {
    const nextWidth = resolveWidth(resizeValue, event.key);

    if (nextWidth !== null) {
      event.preventDefault();
      setWidth(nextWidth);
    }
  };
  const startContextResize = (event: PointerEvent<HTMLDivElement>) =>
    startPanelResize({
      clampWidth: clampAppContextWidth,
      collapsed: contextCollapsed,
      direction: 1,
      event,
      panelSelector: ".app-context",
      resizeValue: contextResizeValue,
      setResizing: setIsContextResizing,
      setWidth: setContextWidth,
    });
  const startDetailResize = (event: PointerEvent<HTMLDivElement>) =>
    startPanelResize({
      clampWidth: clampAppDetailWidth,
      collapsed: detailCollapsed,
      direction: -1,
      event,
      panelSelector: ".app-detail",
      resizeValue: detailResizeValue,
      setResizing: setIsDetailResizing,
      setWidth: setDetailWidth,
    });
  const resizeContextByKeyboard = (event: KeyboardEvent<HTMLDivElement>) =>
    resizePanelByKeyboard(
      event,
      contextResizeValue,
      getAppContextKeyboardResizeWidth,
      setContextWidth,
    );
  const resizeDetailByKeyboard = (event: KeyboardEvent<HTMLDivElement>) =>
    resizePanelByKeyboard(
      event,
      detailResizeValue,
      getAppDetailKeyboardResizeWidth,
      setDetailWidth,
    );
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
    setContextWidth: (width: number) =>
      setContextWidth(clampAppContextWidth(width)),
    layout,
    toggleContext: () => setContextCollapsed((current) => !current),
  };
}

export type WorkbenchController = ReturnType<typeof useWorkbenchLayout>;
