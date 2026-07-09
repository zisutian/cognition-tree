import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
} from "d3-force";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from "react";
import type { UiNoteId } from "../../../application/workspace/projection/viewTree";
import {
  createDrawableReferenceGraphEdges,
  findReferenceGraphNodeAtPoint,
  type PositionedReferenceGraphNode,
  type VisibleReferenceGraph,
} from "./referenceGraphView";
import { drawGraph } from "./referenceGraphCanvasDrawing";
import {
  clampScale,
  createInitialNode,
  createReferenceGraphSimulationKey,
  defaultCanvasSize,
  toGraphPoint,
  type GraphSimulationLink,
  type GraphSimulationNode,
  type GraphTransform,
} from "./referenceGraphCanvasModel";

type ReferenceGraphCanvasProps = {
  graph: VisibleReferenceGraph;
  resetSignal: number;
  selectedNoteId: UiNoteId | null;
  onSelectNote: (noteId: UiNoteId) => void;
};

type GraphDragState =
  | {
      kind: "node";
      node: GraphSimulationNode;
      pointerId: number;
      startGraphX: number;
      startGraphY: number;
    }
  | {
      kind: "pan";
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startTransform: GraphTransform;
    };

export function ReferenceGraphCanvas({
  graph,
  resetSignal,
  selectedNoteId,
  onSelectNote,
}: ReferenceGraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simulationRef = useRef<Simulation<
    GraphSimulationNode,
    GraphSimulationLink
  > | null>(null);
  const nodesRef = useRef<GraphSimulationNode[]>([]);
  const linksRef = useRef<GraphSimulationLink[]>([]);
  const transformRef = useRef<GraphTransform>({ scale: 1, x: 0, y: 0 });
  const dragStateRef = useRef<GraphDragState | null>(null);
  const hoveredNoteIdRef = useRef<string | null>(null);
  const selectedNoteIdRef = useRef<UiNoteId | null>(selectedNoteId);
  const [canvasSize, setCanvasSize] = useState(defaultCanvasSize);
  const graphKey = useMemo(
    () => createReferenceGraphSimulationKey(graph),
    [graph],
  );

  selectedNoteIdRef.current = selectedNoteId;

  const redraw = () => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    drawGraph({
      canvas,
      hoveredNoteId: hoveredNoteIdRef.current,
      links: linksRef.current,
      nodes: nodesRef.current,
      selectedNoteId: selectedNoteIdRef.current,
      transform: transformRef.current,
    });
  };

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

      setCanvasSize({
        height: Math.max(320, entry.contentRect.height),
        width: Math.max(480, entry.contentRect.width),
      });
    });

    resizeObserver.observe(canvas);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    transformRef.current = { scale: 1, x: 0, y: 0 };
    redraw();
  }, [resetSignal]);

  useEffect(() => {
    simulationRef.current?.stop();

    const nodes = graph.nodes.map((node, index) =>
      createInitialNode(
        node,
        index,
        graph.nodes.length,
        canvasSize.width,
        canvasSize.height,
      ),
    );
    const nodeIds = new Set(nodes.map((node) => node.id));
    const links = createDrawableReferenceGraphEdges(graph.edges)
      .filter(
        (edge) =>
          nodeIds.has(edge.sourceNoteId) && nodeIds.has(edge.targetNoteId),
      )
      .map((edge) => ({
        ...edge,
        source: edge.sourceNoteId,
        target: edge.targetNoteId,
      }));

    nodesRef.current = nodes;
    linksRef.current = links;

    if (nodes.length === 0) {
      redraw();
      return undefined;
    }

    const simulation = forceSimulation<GraphSimulationNode, GraphSimulationLink>(
      nodes,
    )
      .force(
        "link",
        forceLink<GraphSimulationNode, GraphSimulationLink>(links)
          .id((node) => node.id)
          .distance((edge) => Math.max(76, 152 - Math.min(edge.count, 8) * 7))
          .strength(0.34),
      )
      .force("charge", forceManyBody<GraphSimulationNode>().strength(-260))
      .force("center", forceCenter(canvasSize.width / 2, canvasSize.height / 2))
      .force(
        "collide",
        forceCollide<GraphSimulationNode>().radius((node) => node.radius + 12),
      )
      .alpha(0.9)
      .alphaDecay(0.045)
      .on("tick", redraw);

    simulationRef.current = simulation;

    return () => {
      simulation.stop();
    };
  }, [canvasSize.height, canvasSize.width, graphKey]);

  useEffect(() => {
    selectedNoteIdRef.current = selectedNoteId;
    redraw();
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

    transformRef.current = {
      scale: nextScale,
      x: pointerX - graphX * nextScale,
      y: pointerY - graphY * nextScale,
    };
    redraw();
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
      x: graphPoint.x,
      y: graphPoint.y,
    });

    event.currentTarget.setPointerCapture(event.pointerId);

    if (hitNode) {
      const simulationNode = nodesRef.current.find(
        (node) => node.id === hitNode.id,
      );

      if (!simulationNode) {
        return;
      }

      simulationNode.fx = simulationNode.x;
      simulationNode.fy = simulationNode.y;
      simulationRef.current?.alphaTarget(0.18).restart();
      dragStateRef.current = {
        kind: "node",
        node: simulationNode,
        pointerId: event.pointerId,
        startGraphX: graphPoint.x,
        startGraphY: graphPoint.y,
      };
      return;
    }

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

        dragState.node.fx = graphPoint.x;
        dragState.node.fy = graphPoint.y;
        redraw();
      } else {
        transformRef.current = {
          ...dragState.startTransform,
          x: dragState.startTransform.x + event.clientX - dragState.startClientX,
          y: dragState.startTransform.y + event.clientY - dragState.startClientY,
        };
        redraw();
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
      x: graphPoint.x,
      y: graphPoint.y,
    });

    const nextHoveredNoteId = hitNode?.id ?? null;

    if (hoveredNoteIdRef.current !== nextHoveredNoteId) {
      hoveredNoteIdRef.current = nextHoveredNoteId;
      redraw();
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
      const movedDistance = Math.hypot(
        graphPoint.x - dragState.startGraphX,
        graphPoint.y - dragState.startGraphY,
      );

      dragState.node.fx = null;
      dragState.node.fy = null;
      simulationRef.current?.alphaTarget(0);

      if (movedDistance < 4) {
        selectedNoteIdRef.current = dragState.node.id;
        redraw();
        onSelectNote(dragState.node.id);
      }
    }

    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    redraw();
  };

  return (
    <canvas
      aria-label="笔记引用力导向图"
      className="graph-force-canvas"
      ref={canvasRef}
      role="img"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerLeave={() => {
        hoveredNoteIdRef.current = null;
        redraw();
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
    />
  );
}
