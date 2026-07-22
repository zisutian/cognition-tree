import type { Simulation } from "d3-force";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
import type { UiNoteId } from "../../../../application/workspace/projection/viewTree";
import {
  findReferenceGraphNodeAtPoint,
  type PositionedReferenceGraphNode,
  type VisibleReferenceGraph,
} from "./referenceGraphView";
import {
  drawGraph,
  getReferenceGraphFocusNodeIds,
  readReferenceGraphCanvasTheme,
  type ReferenceGraphCanvasTheme,
} from "./referenceGraphCanvasDrawing";
import {
  clampScale,
  defaultCanvasSize,
  getNextGraphKeyboardNode,
  releaseGraphSimulationNode,
  toGraphPoint,
  updateGraphNodePointerMovement,
  type GraphSimulationLink,
  type GraphSimulationNode,
  type GraphNodePointerMovement,
  type GraphTransform,
} from "./referenceGraphCanvasModel";
import {
  consumeReferenceGraphResetSignal,
  getReferenceGraphController,
} from "./referenceGraphController";
import {
  createReferenceGraphSimulation,
  resizeReferenceGraphSimulation,
  updateReferenceGraphSimulationForces,
} from "./referenceGraphSimulation";
import type {
  GraphDisplaySettings,
  GraphForceSettings,
} from "./referenceGraphSettings";

type ReferenceGraphCanvasProps = {
  displaySettings: GraphDisplaySettings;
  forceSettings: GraphForceSettings;
  graph: VisibleReferenceGraph;
  resetSignal: number;
  selectedNoteId: UiNoteId | null;
  topologyRevision: string;
  onSelectNote: (noteId: UiNoteId) => void;
};

type GraphDragState =
  | {
      kind: "node";
      movement: GraphNodePointerMovement;
      node: GraphSimulationNode;
      pointerId: number;
    }
  | {
      kind: "pan";
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startTransform: GraphTransform;
    };

export function ReferenceGraphCanvas({
  displaySettings,
  forceSettings,
  graph,
  resetSignal,
  selectedNoteId,
  topologyRevision,
  onSelectNote,
}: ReferenceGraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simulationRef = useRef<Simulation<
    GraphSimulationNode,
    GraphSimulationLink
  > | null>(null);
  const nodesRef = useRef<GraphSimulationNode[]>([]);
  const nodeByIdRef = useRef<Map<string, GraphSimulationNode>>(new Map());
  const linksRef = useRef<GraphSimulationLink[]>([]);
  const themeRef = useRef<ReferenceGraphCanvasTheme | null>(null);
  const dragStateRef = useRef<GraphDragState | null>(null);
  const hoveredNoteIdRef = useRef<string | null>(null);
  const keyboardNoteIdRef = useRef<string | null>(null);
  const selectedNoteIdRef = useRef<UiNoteId | null>(selectedNoteId);
  const displaySettingsRef = useRef(displaySettings);
  const redrawFrameRef = useRef<number | null>(null);
  const handledResetSignalRef = useRef(resetSignal);
  const [canvasSize, setCanvasSize] = useState(defaultCanvasSize);
  const [announcement, setAnnouncement] = useState("");
  const announcementId = useId();
  const controller = useMemo(
    () => getReferenceGraphController(topologyRevision),
    [topologyRevision],
  );
  const controllerRef = useRef(controller);
  const canvasSizeRef = useRef(canvasSize);
  const transformRef = useRef<GraphTransform>(controller.transform);

  controllerRef.current = controller;
  canvasSizeRef.current = canvasSize;
  selectedNoteIdRef.current = selectedNoteId;
  displaySettingsRef.current = displaySettings;

  const redrawNow = () => {
    const canvas = canvasRef.current;
    const theme = themeRef.current;

    if (!canvas || !theme) {
      return;
    }

    drawGraph({
      canvas,
      displaySettings: displaySettingsRef.current,
      focusedNodeIds: getReferenceGraphFocusNodeIds(
        hoveredNoteIdRef.current,
        linksRef.current,
      ),
      hoveredNoteId: hoveredNoteIdRef.current,
      links: linksRef.current,
      nodeById: nodeByIdRef.current,
      nodes: nodesRef.current,
      selectedNoteId:
        keyboardNoteIdRef.current ?? selectedNoteIdRef.current,
      theme,
      transform: transformRef.current,
    });
  };
  const requestRedraw = () => {
    if (redrawFrameRef.current !== null) {
      return;
    }

    redrawFrameRef.current = window.requestAnimationFrame(() => {
      redrawFrameRef.current = null;
      redrawNow();
    });
  };
  const finishPointerInteraction = (
    pointerId?: number,
    canvas?: HTMLCanvasElement,
    releaseCapture = true,
  ) => {
    const dragState = dragStateRef.current;

    if (!dragState || (pointerId !== undefined && dragState.pointerId !== pointerId)) {
      return;
    }

    if (dragState.kind === "node") {
      releaseGraphSimulationNode(dragState.node);
    }

    simulationRef.current?.alphaTarget(0);
    dragStateRef.current = null;

    if (
      releaseCapture &&
      canvas &&
      canvas.hasPointerCapture(dragState.pointerId)
    ) {
      canvas.releasePointerCapture(dragState.pointerId);
    }

    requestRedraw();
  };

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    const updateTheme = () => {
      themeRef.current = readReferenceGraphCanvasTheme(canvas);
      requestRedraw();
    };

    updateTheme();
    const observer = typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(updateTheme);

    observer?.observe(document.documentElement, {
      attributeFilter: ["class", "data-theme", "style"],
      attributes: true,
    });

    return () => observer?.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (!entry) {
        return;
      }

      const nextSize = {
        height: Math.max(320, entry.contentRect.height),
        width: Math.max(480, entry.contentRect.width),
      };

      setCanvasSize((current) =>
        current.height === nextSize.height && current.width === nextSize.width
          ? current
          : nextSize,
      );
    });

    resizeObserver.observe(canvas);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!consumeReferenceGraphResetSignal(handledResetSignalRef, resetSignal)) {
      return;
    }

    controller.resetTransform();
    transformRef.current = controller.transform;
    requestRedraw();
  }, [controller, resetSignal]);

  useEffect(() => {
    transformRef.current = controller.transform;
    const size = canvasSizeRef.current;
    const nodes = controller.createNodes(
      graph.nodes,
      size.width,
      size.height,
    );
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const links = graph.edges
      .filter(
        (edge) =>
          nodeById.has(edge.sourceNoteId) && nodeById.has(edge.targetNoteId),
      )
      .map((edge) => ({
        ...edge,
        source: edge.sourceNoteId,
        target: edge.targetNoteId,
      }));

    nodesRef.current = nodes;
    nodeByIdRef.current = nodeById;
    linksRef.current = links;

    if (nodes.length === 0) {
      requestRedraw();
      return undefined;
    }

    const simulation = createReferenceGraphSimulation({
      height: size.height,
      links,
      nodes,
      width: size.width,
      settings: forceSettings,
      onTick: requestRedraw,
    });

    simulationRef.current = simulation;

    return () => {
      finishPointerInteraction();
      controller.capturePositions(nodes);
      simulation.alphaTarget(0).stop();

      if (simulationRef.current === simulation) {
        simulationRef.current = null;
      }

      if (redrawFrameRef.current !== null) {
        window.cancelAnimationFrame(redrawFrameRef.current);
        redrawFrameRef.current = null;
      }
    };
  }, [topologyRevision]);

  useEffect(() => {
    const simulation = simulationRef.current;

    if (simulation) {
      resizeReferenceGraphSimulation(
        simulation,
        canvasSize.width,
        canvasSize.height,
      );
    }

    requestRedraw();
  }, [canvasSize.height, canvasSize.width]);

  useEffect(() => {
    const simulation = simulationRef.current;

    if (simulation) {
      updateReferenceGraphSimulationForces(simulation, forceSettings);
    }
  }, [
    forceSettings.centerStrength,
    forceSettings.linkDistance,
    forceSettings.linkStrength,
    forceSettings.repulsion,
  ]);

  useEffect(() => {
    requestRedraw();
  }, [
    displaySettings.labelDensity,
    displaySettings.linkThickness,
    displaySettings.nodeScale,
    displaySettings.showArrows,
  ]);

  useEffect(() => {
    selectedNoteIdRef.current = selectedNoteId;
    keyboardNoteIdRef.current = selectedNoteId;
    requestRedraw();
  }, [selectedNoteId]);

  const handleWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const current = transformRef.current;
    const nextScale = clampScale(
      current.scale * (event.deltaY > 0 ? 0.9 : 1.1),
    );
    const graphX = (pointerX - current.x) / current.scale;
    const graphY = (pointerY - current.y) / current.scale;
    const nextTransform = {
      scale: nextScale,
      x: pointerX - graphX * nextScale,
      y: pointerY - graphY * nextScale,
    };

    transformRef.current = nextTransform;
    controllerRef.current.transform = nextTransform;
    requestRedraw();
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) {
      return;
    }

    const graphPoint = toGraphPoint(
      event,
      event.currentTarget,
      transformRef.current,
    );
    const hitNode = findReferenceGraphNodeAtPoint({
      nodes: nodesRef.current as PositionedReferenceGraphNode[],
      nodeScale: displaySettingsRef.current.nodeScale,
      x: graphPoint.x,
      y: graphPoint.y,
    });

    if (hitNode) {
      const simulationNode = nodeByIdRef.current.get(hitNode.id);

      if (!simulationNode) {
        return;
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      dragStateRef.current = {
        kind: "node",
        movement: {
          dragStarted: false,
          startGraphX: graphPoint.x,
          startGraphY: graphPoint.y,
        },
        node: simulationNode,
        pointerId: event.pointerId,
      };
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      kind: "pan",
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startTransform: transformRef.current,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const dragState = dragStateRef.current;

    if (dragState?.pointerId === event.pointerId) {
      if (dragState.kind === "node") {
        const graphPoint = toGraphPoint(
          event,
          event.currentTarget,
          transformRef.current,
        );
        const movement = updateGraphNodePointerMovement(
          dragState.movement,
          graphPoint,
        );

        if (!movement.dragStarted) {
          return;
        }

        if (!dragState.movement.dragStarted) {
          dragState.node.fx = dragState.node.x;
          dragState.node.fy = dragState.node.y;
          simulationRef.current?.alphaTarget(0.18).restart();
        }

        dragStateRef.current = { ...dragState, movement };
        dragState.node.fx = graphPoint.x;
        dragState.node.fy = graphPoint.y;
        requestRedraw();
      } else {
        const nextTransform = {
          ...dragState.startTransform,
          x: dragState.startTransform.x + event.clientX - dragState.startClientX,
          y: dragState.startTransform.y + event.clientY - dragState.startClientY,
        };

        transformRef.current = nextTransform;
        controllerRef.current.transform = nextTransform;
        requestRedraw();
      }

      return;
    }

    const graphPoint = toGraphPoint(
      event,
      event.currentTarget,
      transformRef.current,
    );
    const hitNode = findReferenceGraphNodeAtPoint({
      nodes: nodesRef.current as PositionedReferenceGraphNode[],
      nodeScale: displaySettingsRef.current.nodeScale,
      x: graphPoint.x,
      y: graphPoint.y,
    });
    const nextHoveredNoteId = hitNode?.id ?? null;

    if (hoveredNoteIdRef.current !== nextHoveredNoteId) {
      hoveredNoteIdRef.current = nextHoveredNoteId;
      requestRedraw();
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const dragState = dragStateRef.current;

    if (dragState?.pointerId !== event.pointerId) {
      return;
    }

    if (dragState.kind === "node") {
      const graphPoint = toGraphPoint(
        event,
        event.currentTarget,
        transformRef.current,
      );
      const movement = updateGraphNodePointerMovement(
        dragState.movement,
        graphPoint,
      );

      if (!movement.dragStarted) {
        keyboardNoteIdRef.current = null;
        selectedNoteIdRef.current = dragState.node.id;
        setAnnouncement(`已打开 ${dragState.node.title}`);
        onSelectNote(dragState.node.id);
      }
    }

    finishPointerInteraction(event.pointerId, event.currentTarget);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowRight" ||
      event.key === "ArrowUp" ||
      event.key === "ArrowLeft"
    ) {
      event.preventDefault();
      const direction =
        event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
      const nextNode = getNextGraphKeyboardNode(
        graph.nodes,
        keyboardNoteIdRef.current ?? selectedNoteIdRef.current,
        direction,
      );

      if (nextNode) {
        keyboardNoteIdRef.current = nextNode.id;
        setAnnouncement(`已选择 ${nextNode.title}，按 Enter 打开`);
        requestRedraw();
      }

      return;
    }

    if (event.key === "Enter") {
      const targetId = keyboardNoteIdRef.current ?? selectedNoteIdRef.current;
      const target = targetId ? nodeByIdRef.current.get(targetId) : undefined;

      if (target) {
        event.preventDefault();
        selectedNoteIdRef.current = target.id;
        setAnnouncement(`已打开 ${target.title}`);
        onSelectNote(target.id);
        requestRedraw();
      }
    }
  };

  return (
    <>
      <canvas
        aria-describedby={announcementId}
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter"
        aria-label="笔记引用力导向图"
        className="graph-force-canvas"
        ref={canvasRef}
        role="application"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onLostPointerCapture={(event) =>
          finishPointerInteraction(event.pointerId, event.currentTarget, false)
        }
        onPointerCancel={(event) =>
          finishPointerInteraction(event.pointerId, event.currentTarget)
        }
        onPointerDown={handlePointerDown}
        onPointerLeave={() => {
          hoveredNoteIdRef.current = null;
          requestRedraw();
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      />
      <span
        aria-live="polite"
        className="ui-visually-hidden"
        id={announcementId}
      >
        {announcement}
      </span>
    </>
  );
}
