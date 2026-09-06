// SPDX-License-Identifier: GPL-3.0-or-later

import {
  getCtnEditableLineNumber,
} from "../../ctn/index.ts";
import { TodoContentValidationError } from "./todoErrors.ts";
import type { ParsedTodoCollection } from "./todoValidation.ts";

export function createTodoCollectionBodyProjection(
  parsed: ParsedTodoCollection,
) {
  const editable = parsed.analysis.editableProjection;
  const prefix = `${parsed.name}\n`;
  const source = editable.source === parsed.name
    ? ""
    : editable.source.startsWith(prefix)
      ? editable.source.slice(prefix.length)
      : (() => {
          throw new TodoContentValidationError(
            `Todo collection ${parsed.collection.id} has an invalid editable title.`,
          );
        })();

  return {
    analysis: parsed.analysis,
    editableSource: editable.source,
    name: parsed.name,
    source,
    projectCanonicalLineNumber(canonicalLineNumber: number) {
      return Math.max(
        1,
        getCtnEditableLineNumber(editable, canonicalLineNumber) - 1,
      );
    },
  };
}
