import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ViewModel } from "../application/workspace/view-model/useViewModel";
import type { ActivityId } from "./activityTypes";
import {
  createActivitySlots,
  activityItems,
} from "./activities/activityRegistry";
import { AppFrame } from "./AppFrame";
import {
  appDetailDefaultWidth,
  clampAppDetailWidth,
  getAppDetailKeyboardResizeWidth,
} from "./detailResize";
import {
  appSidebarDefaultWidth,
  clampAppSidebarWidth,
  getAppSidebarKeyboardResizeWidth,
} from "./sidebarResize";
import "./styles/index.css";

type AppViewProps = {
  activeActivityId: ActivityId;
  view: ViewModel;
  onActiveActivityChange: (activityId: ActivityId) => void;
};

function AppView({
  activeActivityId,
  view,
  onActiveActivityChange,
}: AppViewProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [detailWidth, setDetailWidth] = useState<number | null>(null);
  const [isDetailResizing, setIsDetailResizing] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(null);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const removeFrameResizeListenersRef = useRef<(() => void) | null>(null);

  const removeFrameResizeListeners = () => {
    removeFrameResizeListenersRef.current?.();
    removeFrameResizeListenersRef.current = null;
  };

  useEffect(() => () => removeFrameResizeListeners(), []);

  const detailResizeValue = detailWidth ?? appDetailDefaultWidth;
  const sidebarResizeValue = sidebarWidth ?? appSidebarDefaultWidth;

  const handleActivityChange = (activityId: ActivityId) => {
    if (activityId === activeActivityId) {
      setSidebarCollapsed((current) => !current);
      return;
    }

    onActiveActivityChange(activityId);
    setSidebarCollapsed(false);
  };
  const configureSyntax = () => {
    onActiveActivityChange("syntax");
    setSidebarCollapsed(false);
  };
  const handleSidebarResizeStart = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    if (sidebarCollapsed || event.button !== 0) {
      return;
    }

    event.preventDefault();
    removeFrameResizeListeners();

    const sidebarElement = event.currentTarget.closest(".app-sidebar");
    const currentWidth =
      sidebarElement instanceof HTMLElement
        ? sidebarElement.getBoundingClientRect().width
        : sidebarResizeValue;
    const startWidth = clampAppSidebarWidth(currentWidth);
    const startX = event.clientX;

    setSidebarWidth(startWidth);
    setIsSidebarResizing(true);

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      moveEvent.preventDefault();
      setSidebarWidth(
        clampAppSidebarWidth(startWidth + moveEvent.clientX - startX),
      );
    };
    const handlePointerEnd = () => {
      removeFrameResizeListeners();
      setIsSidebarResizing(false);
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerEnd);
    document.addEventListener("pointercancel", handlePointerEnd);
    removeFrameResizeListenersRef.current = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerEnd);
      document.removeEventListener("pointercancel", handlePointerEnd);
    };
  };
  const handleSidebarResizeKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
  ) => {
    const nextWidth = getAppSidebarKeyboardResizeWidth(
      sidebarResizeValue,
      event.key,
    );

    if (nextWidth === null) {
      return;
    }

    event.preventDefault();
    setSidebarWidth(nextWidth);
  };
  const handleDetailResizeStart = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    if (detailCollapsed || event.button !== 0) {
      return;
    }

    event.preventDefault();
    removeFrameResizeListeners();

    const detailElement = event.currentTarget.closest(".app-detail-region");
    const currentWidth =
      detailElement instanceof HTMLElement
        ? detailElement.getBoundingClientRect().width
        : detailResizeValue;
    const startWidth = clampAppDetailWidth(currentWidth);
    const startX = event.clientX;

    setDetailWidth(startWidth);
    setIsDetailResizing(true);

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      moveEvent.preventDefault();
      setDetailWidth(
        clampAppDetailWidth(startWidth + startX - moveEvent.clientX),
      );
    };
    const handlePointerEnd = () => {
      removeFrameResizeListeners();
      setIsDetailResizing(false);
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerEnd);
    document.addEventListener("pointercancel", handlePointerEnd);
    removeFrameResizeListenersRef.current = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerEnd);
      document.removeEventListener("pointercancel", handlePointerEnd);
    };
  };
  const handleDetailResizeKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
  ) => {
    const nextWidth = getAppDetailKeyboardResizeWidth(
      detailResizeValue,
      event.key,
    );

    if (nextWidth === null) {
      return;
    }

    event.preventDefault();
    setDetailWidth(nextWidth);
  };
  const activitySlots = createActivitySlots({
    activityId: activeActivityId,
    onCollapseDetail: () => setDetailCollapsed(true),
    onConfigureSyntax: configureSyntax,
    view,
  });

  return (
    <AppFrame
      activeActivityId={activeActivityId}
      activityItems={activityItems}
      detailCollapsed={detailCollapsed}
      detailResizeValue={detailResizeValue}
      detailSlot={activitySlots.detail}
      detailWidth={detailWidth}
      mainSlot={activitySlots.main}
      isDetailResizing={isDetailResizing}
      isSidebarResizing={isSidebarResizing}
      sidebarResizeValue={sidebarResizeValue}
      sidebarCollapsed={sidebarCollapsed}
      sidebarWidth={sidebarWidth}
      sidebarSlot={activitySlots.sidebar}
      onActivityChange={handleActivityChange}
      onDetailResizeKeyDown={handleDetailResizeKeyDown}
      onDetailResizeStart={handleDetailResizeStart}
      onDetailToggle={() => setDetailCollapsed((current) => !current)}
      onSidebarResizeKeyDown={handleSidebarResizeKeyDown}
      onSidebarResizeStart={handleSidebarResizeStart}
    />
  );
}

export default AppView;
