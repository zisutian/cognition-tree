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
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(null);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const removeSidebarResizeListenersRef = useRef<(() => void) | null>(null);

  const removeSidebarResizeListeners = () => {
    removeSidebarResizeListenersRef.current?.();
    removeSidebarResizeListenersRef.current = null;
  };

  useEffect(() => () => removeSidebarResizeListeners(), []);

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
    removeSidebarResizeListeners();

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
      removeSidebarResizeListeners();
      setIsSidebarResizing(false);
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerEnd);
    document.addEventListener("pointercancel", handlePointerEnd);
    removeSidebarResizeListenersRef.current = () => {
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
  const activitySlots = createActivitySlots({
    activityId: activeActivityId,
    onConfigureSyntax: configureSyntax,
    view,
  });

  return (
    <AppFrame
      activeActivityId={activeActivityId}
      activityItems={activityItems}
      detailSlot={activitySlots.detail}
      mainSlot={activitySlots.main}
      isSidebarResizing={isSidebarResizing}
      sidebarResizeValue={sidebarResizeValue}
      sidebarCollapsed={sidebarCollapsed}
      sidebarWidth={sidebarWidth}
      sidebarSlot={activitySlots.sidebar}
      onActivityChange={handleActivityChange}
      onSidebarResizeKeyDown={handleSidebarResizeKeyDown}
      onSidebarResizeStart={handleSidebarResizeStart}
    />
  );
}

export default AppView;
