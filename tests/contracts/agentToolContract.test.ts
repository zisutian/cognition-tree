// SPDX-License-Identifier: GPL-3.0-or-later

import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import {
  agentToolDefinitions,
  agentToolDefinitionsForDomain,
} from "../../contracts/agent/tools.ts";

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

  it("exposes one strict syntax-read tool to every domain", () => {
    expect(agentToolDefinitions.map(({ name }) => name)).toContain(
      "describe_syntax",
    );
    for (const domain of ["workspace", "journal", "todo"] as const) {
      expect(agentToolDefinitionsForDomain(domain).map(({ name }) => name))
        .toContain("describe_syntax");
    }
    expect(Value.Check(
      agentToolDefinitions.find(({ name }) => name === "describe_syntax")!
        .inputSchema,
      {},
    )).toBe(true);
  });
});

describe("Agent mutation tool compatibility", () => {
  it("exposes only strict top-level object schemas", () => {
    for (const definition of agentToolDefinitions) {
      const schema = definition.inputSchema as unknown as Record<string, unknown>;

      expect(schema.type, definition.name).toBe("object");
      expect(schema.properties, definition.name).toBeTypeOf("object");
      expect(schema.anyOf, definition.name).toBeUndefined();
    }
  });

  it("offers common tools and exactly one mutation domain", () => {
    const workspace = agentToolDefinitionsForDomain("workspace");

    expect(workspace.map(({ name }) => name)).toContain("list");
    expect(workspace.map(({ name }) => name)).toContain(
      "stage_workspace_create_note",
    );
    expect(workspace.some(({ domain }) => domain === "journal")).toBe(false);
    expect(workspace.some(({ domain }) => domain === "todo")).toBe(false);
    expect(agentToolDefinitions.map(({ name }) => name)).not.toEqual(
      expect.arrayContaining([
        "stage_workspace_command",
        "stage_journal_command",
        "stage_todo_command",
      ]),
    );
  });
});
