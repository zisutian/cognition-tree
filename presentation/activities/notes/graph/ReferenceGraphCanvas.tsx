import { createClassNames } from "../../../ui/index.ts";
import graphStyles from "./graph.module.css";
import {
  useReferenceGraphCanvasRuntime,
  type ReferenceGraphCanvasProps,
} from "./useReferenceGraphCanvasRuntime.ts";
const cx = createClassNames(graphStyles);

export function ReferenceGraphCanvas(props: ReferenceGraphCanvasProps) {
  const runtime = useReferenceGraphCanvasRuntime(props);

  return (
    <>
      <canvas
        aria-describedby={runtime.announcementId}
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter"
        aria-label="笔记引用力导向图"
        className={cx("graph-force-canvas")}
        ref={runtime.canvasRef}
        role="application"
        tabIndex={0}
        onKeyDown={runtime.handleKeyDown}
        onLostPointerCapture={runtime.handleLostPointerCapture}
        onPointerCancel={runtime.handlePointerCancel}
        onPointerDown={runtime.handlePointerDown}
        onPointerLeave={runtime.handlePointerLeave}
        onPointerMove={runtime.handlePointerMove}
        onPointerUp={runtime.handlePointerUp}
        onWheel={runtime.handleWheel}
      />
      <span
        aria-live="polite"
        className={cx("ui-visually-hidden")}
        id={runtime.announcementId}
      >
        {runtime.announcement}
      </span>
    </>
  );
}
