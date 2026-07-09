import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ViewModel } from "../application/workspace/view-model/useViewModel";
import type { ActivityId } from "./activityTypes";
import { createActivitySlots } from "./activities/activityRegistry";
import { AppFrame } from "./AppFrame";
import {
  appContextDefaultWidth,
  appDetailDefaultWidth,
  clampAppContextWidth,
  clampAppDetailWidth,
  getAppContextKeyboardResizeWidth,
  getAppDetailKeyboardResizeWidth,
} from "./frameResize";
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
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [contextWidth, setContextWidth] = useState<number | null>(null);
  const [detailWidth, setDetailWidth] = useState<number | null>(null);
  const [isContextResizing, setIsContextResizing] = useState(false);
  const [isDetailResizing, setIsDetailResizing] = useState(false);
  const removeResizeListenersRef = useRef<(() => void) | null>(null);

  const removeResizeListeners = () => {
    removeResizeListenersRef.current?.();
    removeResizeListenersRef.current = null;
  };

  useEffect(() => () => removeResizeListeners(), []);

  const configureSyntax = () => {
    onActiveActivityChange("syntax");
    setContextCollapsed(false);
    setDetailCollapsed(false);
  };
  const activitySlots = createActivitySlots({
    activityId: activeActivityId,
    onCollapseDetail: () => setDetailCollapsed(true),
    onConfigureSyntax: configureSyntax,
    view,
  });
  const contextResizeValue = contextWidth ?? appContextDefaultWidth;
  const detailResizeValue = detailWidth ?? appDetailDefaultWidth;
  const hasContext = activitySlots.context !== null;

  const handleActivityChange = (activityId: ActivityId) => {
    if (activityId === activeActivityId) {
      if (hasContext) {
        setContextCollapsed((current) => !current);
      }
      return;
    }

    onActiveActivityChange(activityId);
    setContextCollapsed(false);
    setDetailCollapsed(false);
  };
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

    if (nextWidth === null) {
      return;
    }

    event.preventDefault();
    setContextWidth(nextWidth);
  };
  const resizeDetailByKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
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

  return (
    <AppFrame
      activeActivityId={activeActivityId}
      contextCollapsed={contextCollapsed}
      contextResizeValue={contextResizeValue}
      contextSlot={activitySlots.context}
      contextWidth={contextWidth}
      detailCollapsed={detailCollapsed}
      detailResizeValue={detailResizeValue}
      detailSlot={activitySlots.detail}
      detailWidth={detailWidth}
      isContextResizing={isContextResizing}
      isDetailResizing={isDetailResizing}
      mainSlot={activitySlots.main}
      mainSpan={activitySlots.mainSpan}
      onActivityChange={handleActivityChange}
      onContextResizeKeyDown={resizeContextByKeyboard}
      onContextResizeStart={startContextResize}
      onDetailResizeKeyDown={resizeDetailByKeyboard}
      onDetailResizeStart={startDetailResize}
      onDetailToggle={() => setDetailCollapsed((current) => !current)}
    />
  );
}

export default AppView;
