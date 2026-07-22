import type {
  GraphSimulationLink,
  GraphSimulationNode,
  GraphTransform,
} from "./referenceGraphCanvasModel";
import { resolveLinkedNodeId } from "./referenceGraphCanvasModel";

function readCanvasColor(canvas: HTMLCanvasElement, name: string) {
  return getComputedStyle(canvas).getPropertyValue(name).trim();
}

export type ReferenceGraphCanvasTheme = {
  edgeColor: string;
  edgeStrongColor: string;
  editorColor: string;
  fontFamily: string;
  mutedNodeColor: string;
  nodeColor: string;
  selectedColor: string;
  textColor: string;
  textMutedColor: string;
};

export function readReferenceGraphCanvasTheme(
  canvas: HTMLCanvasElement,
): ReferenceGraphCanvasTheme {
  const edgeColor = readCanvasColor(canvas, "--color-graph-edge");

  return {
    edgeColor,
    edgeStrongColor: readCanvasColor(canvas, "--color-accent") || edgeColor,
    editorColor: readCanvasColor(canvas, "--color-editor"),
    fontFamily: readCanvasColor(canvas, "--font-ui") || "sans-serif",
    mutedNodeColor: readCanvasColor(canvas, "--color-fg-subtle"),
    nodeColor: readCanvasColor(canvas, "--color-accent"),
    selectedColor: readCanvasColor(canvas, "--color-link"),
    textColor: readCanvasColor(canvas, "--color-fg"),
    textMutedColor: readCanvasColor(canvas, "--color-fg-muted"),
  };
}

export function drawGraph({
  canvas,
  hoveredNoteId,
  links,
  nodeById,
  nodes,
  selectedNoteId,
  theme,
  transform,
}: {
  canvas: HTMLCanvasElement;
  hoveredNoteId: string | null;
  links: GraphSimulationLink[];
  nodeById: ReadonlyMap<string, GraphSimulationNode>;
  nodes: GraphSimulationNode[];
  selectedNoteId: string | null;
  theme: ReferenceGraphCanvasTheme;
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

  const activeNodeId = hoveredNoteId ?? selectedNoteId;

  for (const link of links) {
    const sourceId = resolveLinkedNodeId(link.source);
    const targetId = resolveLinkedNodeId(link.target);
    const source =
      typeof link.source === "object"
        ? link.source
        : nodeById.get(sourceId);
    const target =
      typeof link.target === "object"
        ? link.target
        : nodeById.get(targetId);

    if (!source || !target) {
      continue;
    }

    const isActive =
      activeNodeId === source.id ||
      activeNodeId === target.id ||
      selectedNoteId === source.id ||
      selectedNoteId === target.id;

    context.beginPath();
    context.strokeStyle = isActive ? theme.edgeStrongColor : theme.edgeColor;
    context.globalAlpha = isActive ? 0.82 : 0.36;
    context.lineWidth = Math.min(4, 0.9 + Math.log2(link.count + 1) * 0.7);

    if (source.id === target.id) {
      const loopRadius = source.radius + 8;

      context.arc(
        source.x,
        source.y - loopRadius,
        loopRadius,
        Math.PI * 0.2,
        Math.PI * 1.8,
      );
    } else {
      context.moveTo(source.x, source.y);
      context.lineTo(target.x, target.y);
    }

    context.stroke();
  }

  context.globalAlpha = 1;
  const showLabels = nodes.length <= 80;

  for (const node of nodes) {
    const isSelected = node.id === selectedNoteId;
    const isHovered = node.id === hoveredNoteId;

    context.beginPath();
    context.fillStyle = node.isolated ? theme.mutedNodeColor : theme.nodeColor;
    context.strokeStyle = isSelected || isHovered
      ? theme.selectedColor
      : theme.editorColor;
    context.lineWidth = isSelected || isHovered ? 3 : 2;
    context.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    if (isSelected) {
      context.beginPath();
      context.strokeStyle = theme.selectedColor;
      context.globalAlpha = 0.55;
      context.lineWidth = 1.5;
      context.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = 1;
    }

    if (showLabels || isSelected || isHovered) {
      const label =
        node.title.length > 22 ? `${node.title.slice(0, 21)}...` : node.title;

      context.font = `${isSelected || isHovered ? 600 : 500} 12px ${theme.fontFamily}`;
      context.textAlign = "center";
      context.textBaseline = "top";
      context.lineWidth = 4;
      context.strokeStyle = theme.editorColor;
      context.fillStyle = isSelected || isHovered
        ? theme.textColor
        : theme.textMutedColor;
      context.strokeText(label, node.x, node.y + node.radius + 7);
      context.fillText(label, node.x, node.y + node.radius + 7);
    }
  }

  context.restore();
}
