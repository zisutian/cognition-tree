// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  updateTodoSyntaxSource,
} from "../../../../core/todo/commands/todoSyntaxCommands";
import {
  createTodoParseIndex,
} from "../../../../core/todo/indexes/todoParseIndex";
import {
  createTodoCollectionWithTasks,
  todoBlockId,
  todoTimestamp,
} from "./todoCommandTestFixture";

describe("Todo syntax commands", () => {
  it("updates presentation-only syntax without recanonicalizing collections", () => {
    const content = createTodoCollectionWithTasks();
    const source = content.syntaxSource.replace(
      'textColor = "cyan"',
      'textColor = "red"',
    );

    expect(source).not.toBe(content.syntaxSource);
    const result = updateTodoSyntaxSource(
      content,
      createTodoParseIndex(content),
      {
        createBlockId: () => todoBlockId(99),
        source,
        updatedAt: todoTimestamp(4),
      },
    );

    expect(result.analysisOverrides).toHaveLength(0);
    expect(result.content.collections).toBe(content.collections);
    expect(result.content.syntaxSource).toBe(source);
  });
});
