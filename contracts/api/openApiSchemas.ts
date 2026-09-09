// SPDX-License-Identifier: GPL-3.0-or-later

import { Kind, type TSchema } from "@sinclair/typebox";

type JsonObject = Record<string, unknown>;

/** Lift shared and recursive schemas into one self-contained OpenAPI component graph. */
export class OpenApiSchemas {
  readonly schemas: Record<string, JsonObject> = {};
  readonly #seen = new WeakMap<object, JsonObject>();
  readonly #canonical = new Map<string, string>();
  readonly #ids = new Map<string, { key: string; source: string }>();
  #sequence = 0;

  reference(schema: TSchema, hint?: string): JsonObject {
    if (typeof schema.$ref === "string") return this.#object(schema);
    const seen = this.#seen.get(schema);
    if (seen) return seen;
    const id = typeof schema.$id === "string" ? schema.$id : null;
    const source = id ? JSON.stringify(schema) : null;
    const knownId = id ? this.#ids.get(id) : undefined;
    if (knownId) {
      if (knownId.source !== source)
        throw new Error(`Conflicting schema ID: ${id}`);
      return { $ref: `#/components/schemas/${knownId.key}` };
    }
    const key = `${(hint ?? "Schema").replace(/[^A-Za-z0-9_]/g, "_")}_${++this.#sequence}`;
    const reference = { $ref: `#/components/schemas/${key}` };
    this.#seen.set(schema, reference);
    if (id) this.#ids.set(id, { key, source: source! });
    const result = this.#object(schema);
    const serialized = JSON.stringify(result);
    const equivalent = this.#canonical.get(serialized);
    if (equivalent && !id) {
      reference.$ref = `#/components/schemas/${equivalent}`;
      return reference;
    }
    this.#canonical.set(serialized, key);
    this.schemas[key] = result;
    return reference;
  }

  #object(value: object): JsonObject {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "$id")
        .map(([key, child]) => [key, this.#value(child)]),
    );
  }
  #value(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((child) => this.#value(child));
    if (!value || typeof value !== "object") return value;
    if (Kind in value) {
      const schema = value as TSchema;
      if (
        schema.type === "object" ||
        schema.type === "array" ||
        schema.anyOf ||
        schema.allOf ||
        schema.oneOf ||
        schema.$id ||
        schema.$ref
      )
        return this.reference(schema);
    }
    return this.#object(value);
  }

  finalize(paths: object) {
    const visit = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      if ("$ref" in value && typeof value.$ref === "string") {
        let reference = value.$ref;
        if (!reference.startsWith("#/components/schemas/")) {
          const target = this.#ids.get(reference);
          if (!target)
            throw new Error(`Unresolved schema reference: ${reference}`);
          reference = `#/components/schemas/${target.key}`;
          value.$ref = reference;
        }
        if (!this.schemas[reference.slice("#/components/schemas/".length)])
          throw new Error(`Missing schema component: ${reference}`);
      }
      for (const child of Object.values(value)) visit(child);
    };
    visit(this.schemas);
    visit(paths);
    return this.schemas;
  }
}
