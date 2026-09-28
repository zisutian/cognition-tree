// SPDX-License-Identifier: GPL-3.0-or-later

export type CtnEditorCheckableBlock = {
  blockId: string;
  checked: boolean;
  label: string;
  lineNumber: number;
  recurrenceProgress?: {
    ariaLabel: string;
    text: string;
  };
};

export type CtnEditorCheckableProjection = {
  blocks: readonly CtnEditorCheckableBlock[];
  key: string;
};

const projectionByBlocks = new WeakMap<
  readonly CtnEditorCheckableBlock[],
  CtnEditorCheckableProjection
>();

export function getCtnEditorCheckableProjection(
  blocks: readonly CtnEditorCheckableBlock[],
): CtnEditorCheckableProjection {
  const previous = projectionByBlocks.get(blocks);
  if (previous) return previous;

  const projection = {
    blocks,
    key: createCtnEditorCheckableBlocksKey(blocks),
  };
  projectionByBlocks.set(blocks, projection);
  return projection;
}

export function createCtnEditorCheckableBlocksKey(
  blocks: readonly CtnEditorCheckableBlock[],
) {
  return JSON.stringify(
    blocks.map(
      ({ blockId, checked, label, lineNumber, recurrenceProgress }) => [
        lineNumber,
        blockId,
        checked,
        label,
        recurrenceProgress?.text ?? null,
        recurrenceProgress?.ariaLabel ?? null,
      ],
    ),
  );
}
