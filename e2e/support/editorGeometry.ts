// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type Page } from "@playwright/test";

export type EditorGeometrySnapshot = {
  devicePixelRatio: number;
  normalMarkerX: [number, number, number];
  sourceX: Record<string, number>;
  tabStep: number;
};

const sourcePositions = [
  {
    key: "preferred-opener",
    lineNumber: 5,
    text: "~~~ preferred-top",
  },
  {
    key: "preferred-body",
    lineNumber: 6,
    text: "\tpreferred-content",
  },
  {
    key: "preferred-closer",
    lineNumber: 7,
    text: "~~~",
  },
  {
    key: "legacy-opener",
    lineNumber: 9,
    text: "\t~~~ legacy-level-1",
  },
  {
    key: "legacy-body",
    lineNumber: 10,
    text: "\tlegacy-content",
  },
  {
    key: "legacy-closer",
    lineNumber: 11,
    text: "\t~~~",
  },
  {
    key: "no-prefix-opener",
    lineNumber: 13,
    text: "\t~~~ no-prefix-level-1",
  },
  {
    key: "no-prefix-body",
    lineNumber: 14,
    text: "no-prefix-content",
  },
  {
    key: "no-prefix-closer",
    lineNumber: 15,
    text: "\t~~~",
  },
  {
    key: "empty-opener",
    lineNumber: 17,
    text: "\t~~~ empty-level-1",
  },
  {
    key: "empty-closer",
    lineNumber: 19,
    text: "\t~~~",
  },
  {
    key: "deep-opener",
    lineNumber: 22,
    text: "\t\t~~~ preferred-level-2",
  },
  {
    key: "deep-body",
    lineNumber: 23,
    text: "\t\t\tdeep-content",
  },
  {
    key: "deep-closer",
    lineNumber: 24,
    text: "\t\t~~~",
  },
] as const;

export async function measureEditorGeometry(
  page: Page,
): Promise<EditorGeometrySnapshot> {
  return await page.locator(".source-editor").evaluate(
    (editor, requestedPositions) => {
      const dpr = window.devicePixelRatio;
      const snap = (value: number) => Math.round(value * dpr) / dpr;
      const lines = [...editor.querySelectorAll<HTMLElement>(".cm-line")];
      const sourceCharacterX = (
        line: HTMLElement,
        character: string,
      ) => {
        const walker = document.createTreeWalker(
          line,
          NodeFilter.SHOW_TEXT,
        );
        let node = walker.nextNode();

        while (node) {
          const value = node.nodeValue ?? "";
          const characterIndex = value.indexOf(character);

          if (characterIndex >= 0) {
            const range = document.createRange();

            range.setStart(node, characterIndex);
            range.setEnd(node, characterIndex + 1);
            const rect = range.getClientRects()[0];

            if (!rect) {
              throw new Error("Missing source character rectangle");
            }
            return snap(rect.left);
          }
          node = walker.nextNode();
        }
        throw new Error(`Missing source character: ${character}`);
      };
      const requireLine = (text: string) => {
        const line = lines.find((candidate) =>
          candidate.textContent?.includes(text)
        );

        if (!line) {
          throw new Error(`Missing editor line for geometry tag: ${text}`);
        }
        return line;
      };
      const normalMarkerX = [
        sourceCharacterX(requireLine("calibration-0"), "-"),
        sourceCharacterX(requireLine("calibration-1"), "-"),
        sourceCharacterX(requireLine("calibration-2"), "-"),
      ] as [number, number, number];
      const sourceX: Record<string, number> = {};

      for (const position of requestedPositions) {
        const line = lines[position.lineNumber - 1];

        if (!line || line.textContent !== position.text) {
          throw new Error(
            `Unexpected source at editor line ${position.lineNumber}: ${
              JSON.stringify(line?.textContent)
            }`,
          );
        }
        sourceX[position.key] = sourceCharacterX(
          line,
          position.text.trimStart()[0],
        );
      }

      return {
        devicePixelRatio: dpr,
        normalMarkerX,
        sourceX,
        tabStep: snap(normalMarkerX[1] - normalMarkerX[0]),
      };
    },
    sourcePositions,
  );
}

export function expectGeometryEqual(
  snapshot: EditorGeometrySnapshot,
  actual: number,
  expected: number,
  message: string,
) {
  const tolerance = 1 / snapshot.devicePixelRatio + 1e-6;

  expect(Math.abs(actual - expected), message).toBeLessThanOrEqual(tolerance);
}

export function expectSourceColumn(
  snapshot: EditorGeometrySnapshot,
  key: string,
  level: number,
) {
  expect(snapshot.sourceX[key], `missing source geometry for ${key}`)
    .toBeDefined();
  expectGeometryEqual(
    snapshot,
    snapshot.sourceX[key],
    snapshot.normalMarkerX[0] + snapshot.tabStep * level,
    `${key} must remain at its literal source indentation level ${level}`,
  );
}
