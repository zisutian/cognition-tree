import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
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
  type VisibleReferenceGraphEdge,
  type VisibleReferenceGraphNode,
} from "./referenceGraphView";

type ReferenceGraphCanvasProps = {
  graph: VisibleReferenceGraph;
  resetSignal: number;
  selectedNoteId: UiNoteId | null;
  onSelectNote: (noteId: UiNoteId) => void;
};

type GraphSimulationNode = VisibleReferenceGraphNode & SimulationNodeDatum & {
  x: number;
  y: number;
};

type GraphSimulationLink = SimulationLinkDatum<GraphSimulationNode> &
  VisibleReferenceGraphEdge;

type GraphTransform = {
  scale: number;
  x: number;
  y: number;
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

const defaultCanvasSize = {
  height: 520,
  width: 920,
};
const minScale = 0.35;
const maxScale = 2.8;

function clampScale(scale: number) {
  return Math.min(maxScale, Math.max(minScale, scale));
}

function createInitialNode(
  node: VisibleReferenceGraphNode,
  index: number,
  total: number,
  width: number,
  height: number,
): GraphSimulationNode {
  if (total <= 1) {
    return {
      ...node,
      x: width / 2,
      y: height / 2,
    };
  }

  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const radius = Math.min(width, height) * 0.28;

  return {
    ...node,
    x: width / 2 + Math.cos(angle) * radius,
    y: height / 2 + Math.sin(angle) * radius,
  };
}

function resolveLinkedNodeId(
  node: string | number | GraphSimulationNode | undefined,
) {
  return typeof node === "object" && node ? node.id : String(node ?? "");
}

function toGraphPoint(
  event: PointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
  transform: GraphTransform,
) {
  const rect = canvas.getBoundingClientRect();
  const canvasX = event.clientX - rect.left;
  const canvasY = event.clientY - rect.top;

  return {
    x: (canvasX - transform.x) / transform.scale,
    y: (canvasY - transform.y) / transform.scale,
  };
}

function readCanvasColor(canvas: HTMLCanvasElement, name: string) {
  return getComputedStyle(canvas).getPropertyValue(name).trim();
}

function drawGraph({
  canvas,
  hoveredNoteId,
  links,
  nodes,
  selectedNoteId,
  transform,
}: {
  canvas: HTMLCanvasElement;
  hoveredNoteId: string | null;
  links: GraphSimulationLink[];
  nodes: GraphSimulationNode[];
  selectedNoteId: string | null;
  transform: GraphTransform;
}) {
  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);

  if (
    canvas.width !== Math.round(width * pixelRatio) ||
    canvas.height !== Math.round(height * pixelRatio)
  ) {
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
  }

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.save();
  context.translate(transform.x, transform.y);
  context.scale(transform.scale, transform.scale);

  const edgeColor = readCanvasColor(canvas, "--color-graph-edge");
  const edgeStrongColor =
    readCanvasColor(canvas, "--color-accent") || edgeColor;
  const nodeColor = readCanvasColor(canvas, "--color-accent");
  const mutedNodeColor = readCanvasColor(canvas, "--color-fg-subtle");
  const textColor = readCanvasColor(canvas, "--color-fg");
  const textMutedColor = readCanvasColor(canvas, "--color-fg-muted");
  const editorColor = readCanvasColor(canvas, "--color-editor");
  const selectedColor = readCanvasColor(canvas, "--color-link");
  const fontFamily = readCanvasColor(canvas, "--font-ui") || "sans-serif";
  const activeNodeId = hoveredNoteId ?? selectedNoteId;

  for (const link of links) {
    const sourceId = resolveLinkedNodeId(link.source);
    const targetId = resolveLinkedNodeId(link.target);
    const source =
      typeof link.source === "object"
        ? link.source
        : nodes.find((node) => node.id === sourceId);
    const target =
      typeof link.target === "object"
        ? link.target
        : nodes.find((node) => node.id === targetId);

    if (!source || !target) {
      continue;
    }

    const isActive =
      activeNodeId === source.id ||
      activeNodeId === target.id ||
      selectedNoteId === source.id ||
      selectedNoteId === target.id;

    context.beginPath();
    context.strokeStyle = isActive ? edgeStrongColor : edgeColor;
    context.globalAlpha = isActive ? 0.82 : 0.36;
    context.lineWidth = Math.min(4, 0.9 + Math.log2(link.count + 1) * 0.7);
    context.moveTo(source.x, source.y);
    context.lineTo(target.x, target.y);
    context.stroke();
  }

  context.globalAlpha = 1;
  const showLabels = nodes.length <= 80;

  for (const node of nodes) {
    const isSelected = node.id === selectedNoteId;
    const isHovered = node.id === hoveredNoteId;

    context.beginPath();
    context.fillStyle = node.isolated ? mutedNodeColor : nodeColor;
    context.strokeStyle = isSelected || isHovered ? selectedColor : editorColor;
    context.lineWidth = isSelected || isHovered ? 3 : 2;
    context.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    if (isSelected) {
      context.beginPath();
      context.strokeStyle = selectedColor;
      context.globalAlpha = 0.55;
      context.lineWidth = 1.5;
      context.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = 1;
    }

    if (showLabels || isSelected || isHovered) {
      const label =
        node.title.length > 22 ? `${node.title.slice(0, 21)}...` : node.title;

      context.font = `${isSelected || isHovered ? 600 : 500} 12px ${fontFamily}`;
      context.textAlign = "center";
      context.textBaseline = "top";
      context.lineWidth = 4;
      context.strokeStyle = editorColor;
      context.fillStyle = isSelected || isHovered ? textColor : textMutedColor;
      context.strokeText(label, node.x, node.y + node.radius + 7);
      context.fillText(label, node.x, node.y + node.radius + 7);
    }
  }

  context.restore();
}

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
    () =>
      `${graph.nodes.map((node) => node.id).join("|")}::${graph.edges
        .map((edge) => edge.id)
        .join("|")}`,
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
