// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type CtnEditableProjection,
} from "../analysis/sourceAnalysis.ts";

export type CtnEditableSource = CtnEditableProjection;

export function getCtnEditableLineNumber(
  editableSource: CtnEditableSource,
  canonicalLineNumber: number,
) {
  const normalizedLineNumber = Math.max(1, Math.floor(canonicalLineNumber));

  return editableSource.editableLineNumberByCanonicalLineNumber.get(
    normalizedLineNumber,
  ) ?? Math.max(1, editableSource.lineCount);
}
