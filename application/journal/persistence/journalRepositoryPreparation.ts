// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createJournalParseIndex,
  type JournalParseIndex,
  JournalContentValidationError,
  validateJournalContentAnalysisTransition,
} from "../../../core/journal/index.ts";
import type { JournalContent } from "../../../core/journal/index.ts";


import type {
  PreparedVersionedContent,
} from "../../persistence/index.ts";

export function prepareJournalRepositoryContent(
  content: JournalContent,
  previous?: JournalParseIndex | null,
) {
  try {
    return createJournalParseIndex(content, previous);
  } catch (error) {
    if (error instanceof JournalContentValidationError) throw error;
    throw new JournalContentValidationError(
      `Journal CTN preparation failed: ${
        error instanceof Error ? error.message : "unknown CTN error"
      }`,
    );
  }
}

export function validateJournalRepositoryPreparedTransition(
  previous: PreparedVersionedContent<JournalContent, JournalParseIndex>,
  next: PreparedVersionedContent<JournalContent, JournalParseIndex>,
) {
  validateJournalContentAnalysisTransition(
    previous.projection.validation,
    next.projection.validation,
  );
}
