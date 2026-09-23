// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { parseAgentProfileParameters } from "../../../../application/agentConfiguration/index.ts";

const chat = {
  historyBudgetCharacters: 65_536,
  kind: "chat",
  maxOutputTokens: 1_024,
  maxToolSteps: 8,
  reasoningEffort: "model-default",
  toolCallMode: "native",
} as const;

const codex = {
  kind: "codex",
  maxInputCharacters: 65_536,
  maxOutputCharacters: 4_096,
  reasoningEffort: "high",
} as const;

describe("current Agent Profile parameters", () => {
  it("accepts the current chat and Codex contracts", () => {
    expect(parseAgentProfileParameters(chat, "Profile parameters")).toEqual(chat);
    expect(parseAgentProfileParameters(codex, "Profile parameters")).toEqual(codex);
  });

  it.each([
    [null, "must be an object"],
    [{ ...chat, maxToolSteps: undefined }, "maxToolSteps must be a positive integer"],
    [(() => {
      const { maxToolSteps: _omitted, ...missing } = chat;
      return missing;
    })(), "has unsupported or missing fields"],
    [{ ...chat, extra: true }, "has unsupported or missing fields"],
    [{ ...chat, toolCallMode: "unknown" }, "toolCallMode is invalid"],
    [{ ...chat, reasoningEffort: "ultra" }, "reasoningEffort is invalid"],
    [{ ...chat, maxToolSteps: 0 }, "maxToolSteps must be a positive integer"],
    [{ ...chat, maxToolSteps: Number.MAX_SAFE_INTEGER + 1 }, "maxToolSteps must be a positive integer"],
    [{ ...codex, reasoningEffort: "ultra" }, "reasoningEffort is invalid"],
    [{ ...codex, maxInputCharacters: -1 }, "maxInputCharacters must be a positive integer"],
    [{ ...codex, maxOutputCharacters: Number.MAX_SAFE_INTEGER + 1 }, "maxOutputCharacters must be a positive integer"],
    [{ kind: "unknown" }, "kind is invalid"],
  ] as const)("rejects invalid current parameters %#", (value, message) => {
    expect(() => parseAgentProfileParameters(value, "Profile parameters"))
      .toThrow(`Profile parameters.${message}`.replace(
        "Profile parameters.has unsupported or missing fields",
        "Profile parameters has unsupported or missing fields",
      ).replace(
        "Profile parameters.must be an object",
        "Profile parameters must be an object",
      ));
  });

  it("parses structurally valid stored chat parameters below new-write admission", () => {
    expect(parseAgentProfileParameters({ ...chat, maxToolSteps: 2 }, "profiles[0].parameters"))
      .toMatchObject({ maxToolSteps: 2 });
  });
});
