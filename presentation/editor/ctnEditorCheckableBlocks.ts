// SPDX-License-Identifier: GPL-3.0-or-later

export type CtnEditorCheckableBlock = {
  blockId: string;
  checked: boolean;
  label: string;
  lineNumber: number;
  recurrenceLabel?: string;
};

export function createCtnEditorCheckableBlocksKey(
  blocks: readonly CtnEditorCheckableBlock[],
) {
  return JSON.stringify(
    blocks.map(
      ({ blockId, checked, label, lineNumber, recurrenceLabel }) => [
        lineNumber,
        blockId,
        checked,
        label,
        recurrenceLabel ?? null,
      ],
    ),
  );
}
