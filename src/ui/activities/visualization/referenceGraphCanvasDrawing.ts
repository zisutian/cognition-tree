import type {
  GraphSimulationLink,
  GraphSimulationNode,
  GraphTransform,
} from "./referenceGraphCanvasModel";
import { resolveLinkedNodeId } from "./referenceGraphCanvasModel";

function readCanvasColor(canvas: HTMLCanvasElement, name: string) {
  return getComputedStyle(canvas).getPropertyValue(name).trim();
}

export function drawGraph({
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
