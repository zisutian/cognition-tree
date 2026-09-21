import type {
  GraphSimulationLink,
  GraphSimulationNode,
  GraphTransform,
} from "./referenceGraphCanvasModel.ts";
import { resolveLinkedNodeId } from "./referenceGraphCanvasModel.ts";
import {
  placeReferenceGraphLabels,
  type GraphLabelCandidate,
} from "./referenceGraphLabels.ts";
import type { GraphDisplaySettings } from "./referenceGraphSettings.ts";

function readCanvasToken(canvas: HTMLCanvasElement, name: string) {
  return getComputedStyle(canvas).getPropertyValue(name).trim();
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export type ReferenceGraphCanvasTheme = {
  activeNodeColor: string;
  edgeColor: string;
  edgeStrongColor: string;
  editorColor: string;
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  labelGap: string;
  fontWeight: string;
  emphasisWeight: string;
  mutedNodeColor: string;
  nodeColor: string;
  selectedColor: string;
  textColor: string;
  textMutedColor: string;
};

export function readReferenceGraphCanvasTheme(
  canvas: HTMLCanvasElement,
): ReferenceGraphCanvasTheme {
  const edgeColor = readCanvasToken(canvas, "--cu-color-muted");

  return {
    activeNodeColor: readCanvasToken(canvas, "--cu-color-accent"),
    edgeColor,
    edgeStrongColor: readCanvasToken(canvas, "--cu-color-muted") || edgeColor,
    editorColor: readCanvasToken(canvas, "--cu-color-surface"),
    fontFamily: readCanvasToken(canvas, "--cu-font") || "sans-serif",
    fontSize: readCanvasToken(canvas, "--cu-fontSize"),
    lineHeight: readCanvasToken(canvas, "--cu-lineHeight"),
    labelGap: readCanvasToken(canvas, "--cu-gap"),
    fontWeight: readCanvasToken(canvas, "--cu-weight"),
    emphasisWeight: readCanvasToken(canvas, "--cu-emphasis"),
    mutedNodeColor: readCanvasToken(canvas, "--cu-color-disabled"),
    nodeColor: readCanvasToken(canvas, "--cu-color-muted"),
    selectedColor: readCanvasToken(canvas, "--cu-color-accent"),
    textColor: readCanvasToken(canvas, "--cu-color-strong"),
    textMutedColor: readCanvasToken(canvas, "--cu-color-muted"),
  };
}

export function getReferenceGraphNodeDrawRadius(
  node: Pick<GraphSimulationNode, "radius">,
  nodeScale: number,
) {
  return node.radius * nodeScale;
}

export function getReferenceGraphLinkWidth(
  count: number,
  linkThickness: number,
) {
  return Math.min(4, (0.8 + Math.log2(count + 1) * 0.55) * linkThickness);
}

export function getReferenceGraphFocusNodeIds(
  hoveredNoteId: string | null,
  links: GraphSimulationLink[],
) {
  if (!hoveredNoteId) {
    return null;
  }

  const focusedNodeIds = new Set([hoveredNoteId]);

  for (const link of links) {
    const sourceId = resolveLinkedNodeId(link.source);
    const targetId = resolveLinkedNodeId(link.target);

    if (sourceId === hoveredNoteId) {
      focusedNodeIds.add(targetId);
    }

    if (targetId === hoveredNoteId) {
      focusedNodeIds.add(sourceId);
    }
  }

  return focusedNodeIds;
}

export function getReferenceGraphNodeOpacity(
  nodeId: string,
  focusedNodeIds: ReadonlySet<string> | null,
) {
  return focusedNodeIds && !focusedNodeIds.has(nodeId) ? 0.18 : 1;
}

export function getReferenceGraphEdgeOpacity({
  hoveredNoteId,
  selectedNoteId,
  sourceId,
  targetId,
}: {
  hoveredNoteId: string | null;
  selectedNoteId: string | null;
  sourceId: string;
  targetId: string;
}) {
  const touchesHovered = Boolean(
    hoveredNoteId && (sourceId === hoveredNoteId || targetId === hoveredNoteId),
  );

  if (hoveredNoteId) {
    return touchesHovered ? 0.88 : 0.08;
  }

  return selectedNoteId === sourceId || selectedNoteId === targetId
    ? 0.64
    : 0.28;
}

export function rankReferenceGraphNodesForLabels(nodes: GraphSimulationNode[]) {
  return [...nodes].sort((left, right) => {
    const referenceDifference =
      right.referencesIn +
      right.referencesOut -
      (left.referencesIn + left.referencesOut);

    return (
      referenceDifference ||
      left.title.localeCompare(right.title) ||
      left.id.localeCompare(right.id)
    );
  });
}

export function getReferenceGraphLabelOpacity({
  emphasized,
  labelDensity,
  nodeCount,
  rank,
  scale,
}: {
  emphasized: boolean;
  labelDensity: number;
  nodeCount: number;
  rank: number;
  scale: number;
}) {
  if (emphasized) {
    return 1;
  }

  const effectiveDensity = clamp(
    labelDensity + Math.max(0, scale - 1) * 35 - Math.max(0, 1 - scale) * 55,
    0,
    100,
  );

  if (effectiveDensity === 0 || nodeCount === 0) {
    return 0;
  }

  if (nodeCount <= 8 && effectiveDensity >= 65) {
    return 0.9;
  }

  // Density chooses which labels to show; every visible label stays readable.
  const visibleCount = Math.ceil((effectiveDensity / 100) * nodeCount);
  return rank < visibleCount ? 0.9 : 0;
}

export function getReferenceGraphLineEndpoints({
  nodeScale,
  showArrow,
  source,
  target,
}: {
  nodeScale: number;
  showArrow: boolean;
  source: GraphSimulationNode;
  target: GraphSimulationNode;
}) {
  const deltaX = target.x - source.x;
  const deltaY = target.y - source.y;
  const distance = Math.hypot(deltaX, deltaY);

  if (distance === 0) {
    return null;
  }

  const unitX = deltaX / distance;
  const unitY = deltaY / distance;
  const sourcePadding = getReferenceGraphNodeDrawRadius(source, nodeScale) + 2;
  const targetPadding =
    getReferenceGraphNodeDrawRadius(target, nodeScale) + (showArrow ? 7 : 2);

  return {
    angle: Math.atan2(deltaY, deltaX),
    endX: target.x - unitX * targetPadding,
    endY: target.y - unitY * targetPadding,
    startX: source.x + unitX * sourcePadding,
    startY: source.y + unitY * sourcePadding,
  };
}

function drawArrowhead(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
) {
  const length = 6;
  const halfWidth = 3.5;

  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(
    x - Math.cos(angle) * length + Math.sin(angle) * halfWidth,
    y - Math.sin(angle) * length - Math.cos(angle) * halfWidth,
  );
  context.lineTo(
    x - Math.cos(angle) * length - Math.sin(angle) * halfWidth,
    y - Math.sin(angle) * length + Math.cos(angle) * halfWidth,
  );
  context.closePath();
  context.fill();
}

export function drawGraph({
  canvas,
  displaySettings,
  focusedNodeIds,
  hoveredNoteId,
  links,
  nodeById,
  nodes,
  selectedNoteId,
  theme,
  transform,
}: {
  canvas: HTMLCanvasElement;
  displaySettings: GraphDisplaySettings;
  focusedNodeIds: ReadonlySet<string> | null;
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

  for (const link of links) {
    const sourceId = resolveLinkedNodeId(link.source);
    const targetId = resolveLinkedNodeId(link.target);
    const source =
      typeof link.source === "object" ? link.source : nodeById.get(sourceId);
    const target =
      typeof link.target === "object" ? link.target : nodeById.get(targetId);

    if (!source || !target) {
      continue;
    }

    const isEmphasized =
      hoveredNoteId === source.id ||
      hoveredNoteId === target.id ||
      selectedNoteId === source.id ||
      selectedNoteId === target.id;

    context.globalAlpha = getReferenceGraphEdgeOpacity({
      hoveredNoteId,
      selectedNoteId,
      sourceId,
      targetId,
    });
    context.strokeStyle = isEmphasized
      ? theme.edgeStrongColor
      : theme.edgeColor;
    context.fillStyle = context.strokeStyle;
    context.lineWidth = getReferenceGraphLinkWidth(
      link.count,
      displaySettings.linkThickness,
    );
    context.beginPath();

    if (source.id === target.id) {
      const nodeRadius = getReferenceGraphNodeDrawRadius(
        source,
        displaySettings.nodeScale,
      );
      const loopRadius = nodeRadius + 9;
      const centerX = source.x;
      const centerY = source.y - loopRadius;
      const startAngle = Math.PI * 0.2;
      const endAngle = Math.PI * 1.8;

      context.arc(centerX, centerY, loopRadius, startAngle, endAngle);
      context.stroke();

      if (displaySettings.showArrows) {
        drawArrowhead(
          context,
          centerX + Math.cos(endAngle) * loopRadius,
          centerY + Math.sin(endAngle) * loopRadius,
          endAngle + Math.PI / 2,
        );
      }
    } else {
      const endpoints = getReferenceGraphLineEndpoints({
        nodeScale: displaySettings.nodeScale,
        showArrow: displaySettings.showArrows,
        source,
        target,
      });

      if (!endpoints) {
        continue;
      }

      context.moveTo(endpoints.startX, endpoints.startY);
      context.lineTo(endpoints.endX, endpoints.endY);
      context.stroke();

      if (displaySettings.showArrows) {
        drawArrowhead(context, endpoints.endX, endpoints.endY, endpoints.angle);
      }
    }
  }

  const labelRanks = new Map(
    rankReferenceGraphNodesForLabels(nodes).map((node, index) => [
      node.id,
      index,
    ]),
  );

  const labels: Array<
    GraphLabelCandidate & {
      text: string;
      opacity: number;
      emphasized: boolean;
    }
  > = [];
  const screenNodes: Array<{ x: number; y: number; radius: number }> = [];
  const fontSize = Number.parseFloat(theme.fontSize);
  const labelGap = Number.parseFloat(theme.labelGap);
  const labelHeight = fontSize * Number.parseFloat(theme.lineHeight);
  const maxLabelWidth = Math.max(
    fontSize,
    Math.min(fontSize * 14, width - labelGap * 4),
  );

  for (const node of nodes) {
    const isSelected = node.id === selectedNoteId;
    const isHovered = node.id === hoveredNoteId;
    const nodeOpacity = getReferenceGraphNodeOpacity(node.id, focusedNodeIds);
    const baseRadius = getReferenceGraphNodeDrawRadius(
      node,
      displaySettings.nodeScale,
    );
    const radius = isSelected ? baseRadius * 1.14 : baseRadius;
    const screenNode = {
      x: node.x * transform.scale + transform.x,
      y: node.y * transform.scale + transform.y,
      radius: (radius + (isSelected ? 5 : 0)) * transform.scale,
    };
    screenNodes.push(screenNode);
    const nodeColor = isSelected
      ? theme.selectedColor
      : isHovered
        ? theme.activeNodeColor
        : node.isolated
          ? theme.mutedNodeColor
          : theme.nodeColor;

    if (isSelected) {
      context.globalAlpha = nodeOpacity * 0.16;
      context.beginPath();
      context.fillStyle = theme.selectedColor;
      context.arc(node.x, node.y, radius + 5, 0, Math.PI * 2);
      context.fill();
    }

    context.globalAlpha = nodeOpacity;
    context.beginPath();
    context.fillStyle = nodeColor;
    context.arc(node.x, node.y, radius, 0, Math.PI * 2);
    context.fill();

    const labelOpacity =
      getReferenceGraphLabelOpacity({
        emphasized: isSelected || isHovered,
        labelDensity: displaySettings.labelDensity,
        nodeCount: nodes.length,
        rank: labelRanks.get(node.id) ?? nodes.length,
        scale: transform.scale,
      }) * nodeOpacity;

    if (labelOpacity > 0) {
      const emphasized = isSelected || isHovered;
      context.font = `${emphasized ? theme.emphasisWeight : theme.fontWeight} ${theme.fontSize} ${theme.fontFamily}`;
      let text = node.title;
      if (context.measureText(text).width > maxLabelWidth) {
        const characters = Array.from(text);
        let start = 0;
        let end = characters.length;
        while (start < end) {
          const middle = Math.ceil((start + end) / 2);
          const trial = `${characters.slice(0, middle).join("")}…`;
          if (context.measureText(trial).width <= maxLabelWidth) {
            start = middle;
          } else {
            end = middle - 1;
          }
        }
        text = `${characters.slice(0, start).join("")}…`;
      }
      labels.push({
        id: node.id,
        ...screenNode,
        width: context.measureText(text).width,
        height: labelHeight,
        priority: isHovered
          ? 0
          : isSelected
            ? 1
            : 2 + (labelRanks.get(node.id) ?? nodes.length),
        text,
        opacity: labelOpacity,
        emphasized,
      });
    }
  }

  // Labels keep the interface font size while the graph zooms. Draw them after
  // all nodes and links, so a later edge or node cannot paint over a title.
  context.restore();
  const placements = placeReferenceGraphLabels({
    candidates: labels,
    nodes: screenNodes,
    width,
    height,
    gap: labelGap,
  });
  for (const label of labels) {
    const placement = placements.get(label.id);
    if (!placement) continue;
    context.globalAlpha = label.opacity;
    context.font = `${label.emphasized ? theme.emphasisWeight : theme.fontWeight} ${theme.fontSize} ${theme.fontFamily}`;
    context.textAlign = "left";
    context.textBaseline = "top";
    context.lineJoin = "round";
    context.lineWidth = 4;
    context.strokeStyle = theme.editorColor;
    context.fillStyle = label.emphasized
      ? theme.textColor
      : theme.textMutedColor;
    context.strokeText(label.text, placement.x, placement.y);
    context.fillText(label.text, placement.x, placement.y);
  }

  context.globalAlpha = 1;
}
