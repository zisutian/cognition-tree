// SPDX-License-Identifier: GPL-3.0-or-later

import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import { agentToolDefinitions } from "../../contracts/agent/tools.ts";

function tool(name: "list" | "read") {
  return agentToolDefinitions.find((definition) => definition.name === name)!;
}

describe("Agent read tool contract", () => {
  it("derives the domain from immutable session scope", () => {
    expect(Value.Check(tool("list").inputSchema, {})).toBe(true);
    expect(Value.Check(tool("list").inputSchema, { domain: "workspace" }))
      .toBe(false);
    expect(Value.Check(tool("read").inputSchema, { resourceId: "note-1" }))
      .toBe(true);
    expect(Value.Check(tool("read").inputSchema, {
      domain: "workspace",
      resourceId: "note-1",
    })).toBe(false);
  });
});

describe("Agent mutation tool compatibility", () => {
  it("documents the root union currently exposed to Ollama", () => {
    const definition = agentToolDefinitions.find(({ name }) =>
      name === "stage_workspace_command"
    )!;
    const schema = definition.inputSchema as unknown as Record<string, unknown>;

    expect(schema.type).toBeUndefined();
    expect(schema.properties).toBeUndefined();
    expect(schema.anyOf).toBeInstanceOf(Array);
    expect(Value.Check(definition.inputSchema, {})).toBe(false);
  });
});
