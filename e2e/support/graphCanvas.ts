import type { Locator } from "@playwright/test";

export type GraphCanvasNodeSample = {
  selectedPixelCount: number;
  x: number;
  y: number;
};

export async function readGraphCanvasNodes(
  canvasLocator: Locator,
): Promise<GraphCanvasNodeSample[]> {
  return canvasLocator.evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      return [];
    }

    const parseColor = (source: string) => {
      const hex = source.trim().match(/^#([0-9a-f]{6})$/i)?.[1];

      if (hex) {
        return [
          Number.parseInt(hex.slice(0, 2), 16),
          Number.parseInt(hex.slice(2, 4), 16),
          Number.parseInt(hex.slice(4, 6), 16),
        ];
      }

      const channels = source.match(/\d+(?:\.\d+)?/g)?.slice(0, 3)
        .map(Number);

      return channels?.length === 3 ? channels : null;
    };
    const style = getComputedStyle(canvas);
    const nodeColors = [
      "--color-fg-muted",
      "--color-fg-subtle",
      "--color-link",
      "--color-accent",
    ].map((name) => parseColor(style.getPropertyValue(name)))
      .filter((color): color is number[] => Boolean(color));
    const selectedColor = parseColor(
      style.getPropertyValue("--color-accent"),
    );

    if (nodeColors.length === 0 || !selectedColor) {
      return [];
    }

    const { data, height, width } = context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const visited = new Uint8Array(width * height);
    const matchesColor = (
      pixelIndex: number,
      color: number[],
      minimumAlpha: number,
    ) => {
      const offset = pixelIndex * 4;

      return data[offset] === color[0] &&
        data[offset + 1] === color[1] &&
        data[offset + 2] === color[2] &&
        data[offset + 3] >= minimumAlpha;
    };
    const matchesNodeColor = (pixelIndex: number) =>
      nodeColors.some((color) => matchesColor(pixelIndex, color, 250));
    const components: Array<{ count: number; x: number; y: number }> = [];

    for (let index = 0; index < width * height; index += 1) {
      if (visited[index] || !matchesNodeColor(index)) {
        continue;
      }

      const pending = [index];
      let count = 0;
      let sumX = 0;
      let sumY = 0;

      visited[index] = 1;
      while (pending.length > 0) {
        const current = pending.pop() ?? 0;
        const x = current % width;
        const y = Math.floor(current / width);

        count += 1;
        sumX += x;
        sumY += y;

        const neighbors = [
          x > 0 ? current - 1 : -1,
          x + 1 < width ? current + 1 : -1,
          y > 0 ? current - width : -1,
          y + 1 < height ? current + width : -1,
        ];

        neighbors.forEach((neighbor) => {
          if (
            neighbor >= 0 &&
            !visited[neighbor] &&
            matchesNodeColor(neighbor)
          ) {
            visited[neighbor] = 1;
            pending.push(neighbor);
          }
        });
      }

      if (count >= 40) {
        components.push({ count, x: sumX / count, y: sumY / count });
      }
    }

    const ratioX = canvas.width / canvas.getBoundingClientRect().width;
    const ratioY = canvas.height / canvas.getBoundingClientRect().height;

    return components
      .map((component) => {
        const sampleRadius = Math.ceil(22 * Math.max(ratioX, ratioY));
        const minX = Math.max(0, Math.floor(component.x - sampleRadius));
        const maxX = Math.min(width - 1, Math.ceil(component.x + sampleRadius));
        const minY = Math.max(0, Math.floor(component.y - sampleRadius));
        const maxY = Math.min(height - 1, Math.ceil(component.y + sampleRadius));
        let selectedPixelCount = 0;

        for (let y = minY; y <= maxY; y += 1) {
          for (let x = minX; x <= maxX; x += 1) {
            if (matchesColor(y * width + x, selectedColor, 80)) {
              selectedPixelCount += 1;
            }
          }
        }

        return {
          selectedPixelCount,
          x: component.x / ratioX,
          y: component.y / ratioY,
        };
      })
      .sort((left, right) => left.x - right.x);
  });
}
