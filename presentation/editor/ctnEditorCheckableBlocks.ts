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
