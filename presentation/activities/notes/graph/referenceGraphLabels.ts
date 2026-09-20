/** Screen-space label placement. Node geometry and force simulation stay independent. */
type Rect = { x: number; y: number; width: number; height: number };
export type GraphLabelCandidate = {
  id: string;
  x: number;
  y: number;
  radius: number;
  width: number;
  height: number;
  priority: number;
};

function intersects(a: Rect, b: Rect) {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
}

// A spatial index keeps each animation frame from comparing every pair of labels.
class LabelObstacles {
  private readonly cells = new Map<string, Rect[]>();
  private readonly cellSize = 64;

  private keys(rect: Rect) {
    const keys: string[] = [];
    const minX = Math.floor(rect.x / this.cellSize);
    const maxX = Math.floor((rect.x + rect.width) / this.cellSize);
    const minY = Math.floor(rect.y / this.cellSize);
    const maxY = Math.floor((rect.y + rect.height) / this.cellSize);
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        keys.push(`${x}:${y}`);
      }
    }
    return keys;
  }

  add(rect: Rect) {
    for (const key of this.keys(rect)) {
      const cell = this.cells.get(key) ?? [];
      cell.push(rect);
      this.cells.set(key, cell);
    }
  }

  intersects(rect: Rect) {
    return this.keys(rect).some((key) =>
      this.cells.get(key)?.some((other) => intersects(rect, other)),
    );
  }
}

export function placeReferenceGraphLabels({
  candidates,
  nodes,
  width,
  height,
  gap,
}: {
  candidates: GraphLabelCandidate[];
  nodes: ReadonlyArray<{ x: number; y: number; radius: number }>;
  width: number;
  height: number;
  gap: number;
}) {
  const obstacles = new LabelObstacles();
  const placedLabels = new LabelObstacles();
  for (const node of nodes) {
    obstacles.add({
      x: node.x - node.radius - gap / 2,
      y: node.y - node.radius - gap / 2,
      width: node.radius * 2 + gap,
      height: node.radius * 2 + gap,
    });
  }
  const placements = new Map<string, Rect>();
  for (const label of [...candidates].sort((a, b) => a.priority - b.priority)) {
    if (label.x < 0 || label.x > width || label.y < 0 || label.y > height) continue;
    const offsets = [
      { x: -label.width / 2, y: label.radius + gap },
      { x: label.radius + gap, y: -label.height / 2 },
      { x: -label.radius - gap - label.width, y: -label.height / 2 },
      { x: -label.width / 2, y: -label.radius - gap - label.height },
    ];
    const choices = offsets.map(({ x, y }) => ({
      x: label.x + x, y: label.y + y, width: label.width, height: label.height,
    }));
    const placement = choices.find((rect) =>
      rect.x >= gap && rect.y >= gap &&
      rect.x + rect.width <= width - gap && rect.y + rect.height <= height - gap &&
      !obstacles.intersects(rect),
    );
    // Keep the selected/hovered title available even in a fully packed cluster.
    const resolved = placement ?? (label.priority < 2 ? {
      ...choices[0],
      x: Math.max(gap, Math.min(width - gap - label.width, choices[0].x)),
      y: Math.max(gap, Math.min(height - gap - label.height, choices[0].y)),
    } : null);
    if (!resolved || placedLabels.intersects(resolved)) continue;
    placements.set(label.id, resolved);
    const reserved = {
      x: resolved.x - gap / 2, y: resolved.y - gap / 2,
      width: resolved.width + gap, height: resolved.height + gap,
    };
    obstacles.add(reserved);
    placedLabels.add(reserved);
  }
  return placements;
}
