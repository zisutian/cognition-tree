// SPDX-License-Identifier: GPL-3.0-or-later

import {
  getCtnEditableLineNumber,
} from "../../ctn/index.ts";
import { JournalContentValidationError } from "./journalErrors.ts";
import type { ParsedJournalEntry } from "./journalValidation.ts";

export function createJournalEntryBodyProjection(
  parsed: ParsedJournalEntry,
) {
  const editable = parsed.analysis.editableProjection;
  const prefix = `${parsed.title}\n`;
  let source: string;

  if (editable.source === parsed.title) {
    source = "";
  } else if (editable.source.startsWith(prefix)) {
    source = editable.source.slice(prefix.length);
  } else {
    throw new JournalContentValidationError(
      `Journal entry ${parsed.entry.id} has an invalid editable title.`,
    );
  }

  return {
    analysis: parsed.analysis,
    editableSource: editable.source,
    source,
    title: parsed.title,
    projectCanonicalLineNumber(canonicalLineNumber: number) {
      return Math.max(
        1,
        getCtnEditableLineNumber(editable, canonicalLineNumber) - 1,
      );
    },
  };
}
