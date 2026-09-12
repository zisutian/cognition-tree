// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, it } from "vitest";
import { agentToolDecoder } from "../../../../../infrastructure/server/agent/sessionToolProtocol.ts";
import { parseApiSchema } from "../../../../../contracts/api/index.ts";
import { TodoCommandIntentSchema } from "../../../../../contracts/content/index.ts";

it("translates the model's monthly day to the neutral Todo rule contract", () => {
  const decoded = agentToolDecoder.decode({ callId: "call-monthly", name: "stage_todo_set_monthly_recurrence", arguments: { collectionId: "collection", blockId: "block", day: 15, interval: 2 } });
  expect(decoded.kind).toBe("stage-todo");
  if (decoded.kind !== "stage-todo") throw new Error("Expected a Todo command.");
  expect(parseApiSchema(TodoCommandIntentSchema, decoded.intent)).toMatchObject({ kind: "set-recurrence", rule: { kind: "monthly", dayOfMonth: 15, interval: 2 } });
});
