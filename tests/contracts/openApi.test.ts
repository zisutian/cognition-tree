// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  createApiOpenApiDocument,
  getApiOperation,
} from "../../contracts/api/index.ts";

type JsonObject = Record<string, unknown>;

/** Compare schema constraints after expanding references, retaining recursive edges. */
function expanded(
  schema: unknown,
  definitions: Record<string, JsonObject> = {},
) {
  const ids = new Map<string, JsonObject>();
  const collect = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if ("$id" in value && typeof value.$id === "string")
      ids.set(value.$id, value as JsonObject);
    for (const child of Object.values(value)) collect(child);
  };
  collect(schema);
  const visit = (value: unknown, active: Set<object>): unknown => {
    if (!value || typeof value !== "object") return value;
    if ("$ref" in value && typeof value.$ref === "string") {
      const target = value.$ref.startsWith("#/components/schemas/")
        ? definitions[value.$ref.slice("#/components/schemas/".length)]
        : ids.get(value.$ref);
      if (!target) throw new Error(`Unresolved reference ${value.$ref}`);
      return visit(target, active);
    }
    if (active.has(value)) return { recursive: true };
    const next = new Set(active).add(value);
    if (Array.isArray(value)) return value.map((child) => visit(child, next));
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "$id")
        .map(([key, child]) => [key, visit(child, next)]),
    );
  };
  return visit(schema, new Set());
}

describe("OpenAPI schema graph", () => {
  it("keeps a compact self-contained graph with every recursive and shared reference resolvable", () => {
    const document = createApiOpenApiDocument();
    const serialized = JSON.stringify(document);
    // Large duplicated Agent proposal schemas previously exceeded 26 MB.
    expect(Buffer.byteLength(serialized)).toBeLessThan(512 * 1024);
    const visit = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      expect(value).not.toHaveProperty("$id");
      if ("$ref" in value) {
        expect(value.$ref).toMatch(/^#\/components\/schemas\/[^/]+$/);
        expect(
          document.components.schemas[String(value.$ref).split("/").at(-1)!],
        ).toBeDefined();
      }
      for (const child of Object.values(value)) visit(child);
    };
    visit(document);
  });

  it.each([
    "putWorkspaceSyncSnapshot",
    "executeContentOperation",
    "queryLocalContent",
    "getAgentSession",
  ])(
    "preserves registry constraints for %s, including recursive content and error receipts",
    (operationId) => {
      const document = createApiOpenApiDocument();
      const operation = getApiOperation(operationId);
      const exposed = document.paths[operation.path]![
        operation.method.toLowerCase()
      ] as {
        requestBody?: { content: Record<string, { schema: unknown }> };
        responses: Record<
          string,
          { content: Record<string, { schema: unknown }> }
        >;
      };
      if (operation.body)
        expect(
          expanded(
            exposed.requestBody!.content["application/json"]!.schema,
            document.components.schemas,
          ),
        ).toEqual(expanded(operation.body.schema));
      for (const [status, schema] of Object.entries(operation.responses)) {
        if (schema)
          expect(
            expanded(
              exposed.responses[status]!.content[
                operation.responseMediaType ?? "application/json"
              ]!.schema,
              document.components.schemas,
            ),
          ).toEqual(expanded(schema));
      }
    },
  );

  it("exposes only the local query, execution and receipt operations when requested", () => {
    const document = createApiOpenApiDocument({ contentOnly: true });
    expect(
      Object.values(document.paths)
        .flatMap((methods) =>
          Object.values(methods).map(
            (operation) => (operation as { operationId: string }).operationId,
          ),
        )
        .sort(),
    ).toEqual([
      "executeContentOperation",
      "getContentOperation",
      "queryLocalContent",
    ]);
    expect(Buffer.byteLength(JSON.stringify(document))).toBeLessThan(
      128 * 1024,
    );
    expect(JSON.stringify(document)).not.toContain("/api/v4/admin/");
  });
});
