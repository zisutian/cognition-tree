// SPDX-License-Identifier: GPL-3.0-or-later

type JsonSerializationOptions = {
  indent?: number;
  sortObjectKeys?: boolean;
};

type SerializationFrame =
  | { kind: "leave"; value: object }
  | { kind: "text"; value: string }
  | {
      arrayElement: boolean;
      depth: number;
      kind: "value";
      value: unknown;
    };

function serializePrimitive(value: unknown, arrayElement: boolean) {
  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return Number.isFinite(value) ? String(value) : "null";
    case "undefined":
    case "function":
    case "symbol":
      return arrayElement ? "null" : undefined;
    case "bigint":
      throw new TypeError("BigInt cannot be serialized as JSON");
    default:
      return null;
  }
}

/**
 * Serializes JSON-compatible values without recursing through object graphs.
 * Repository trees are intentionally allowed to exceed the JavaScript call
 * stack, so persistence and wire encoding must not delegate traversal to
 * JSON.stringify.
 */
export function serializeJsonIteratively(
  value: unknown,
  {
    indent = 0,
    sortObjectKeys = false,
  }: JsonSerializationOptions = {},
) {
  const indentation = Math.max(0, Math.min(10, Math.trunc(indent)));
  const chunks: string[] = [];
  const activeContainers = new WeakSet<object>();
  const frames: SerializationFrame[] = [
    { arrayElement: false, depth: 0, kind: "value", value },
  ];
  const lineBreak = indentation > 0 ? "\n" : "";
  const separator = indentation > 0 ? ": " : ":";
  const indentationAt = (depth: number) =>
    indentation > 0 ? " ".repeat(depth * indentation) : "";

  while (frames.length > 0) {
    const frame = frames.pop();

    if (!frame) {
      break;
    }
    if (frame.kind === "text") {
      chunks.push(frame.value);
      continue;
    }
    if (frame.kind === "leave") {
      activeContainers.delete(frame.value);
      continue;
    }

    const primitive = serializePrimitive(frame.value, frame.arrayElement);

    if (primitive !== null) {
      if (primitive === undefined) {
        throw new TypeError("The root value cannot be represented as JSON");
      }
      chunks.push(primitive);
      continue;
    }

    const container = frame.value as object;

    if (activeContainers.has(container)) {
      throw new TypeError("Converting circular structure to JSON");
    }
    activeContainers.add(container);
    frames.push({ kind: "leave", value: container });

    if (Array.isArray(container)) {
      chunks.push("[");
      if (container.length === 0) {
        chunks.push("]");
        continue;
      }

      frames.push({
        kind: "text",
        value: `${lineBreak}${indentationAt(frame.depth)}]`,
      });
      for (let index = container.length - 1; index >= 0; index -= 1) {
        frames.push({
          kind: "value",
          value: container[index],
          arrayElement: true,
          depth: frame.depth + 1,
        });
        frames.push({
          kind: "text",
          value: `${index === 0 ? "" : ","}${lineBreak}${indentationAt(frame.depth + 1)}`,
        });
      }
      continue;
    }

    let keys = Object.keys(container).filter((key) => {
      const field = (container as Record<string, unknown>)[key];

      return field !== undefined &&
        typeof field !== "function" &&
        typeof field !== "symbol";
    });

    if (sortObjectKeys) {
      keys = keys.sort();
    }

    chunks.push("{");
    if (keys.length === 0) {
      chunks.push("}");
      continue;
    }

    frames.push({
      kind: "text",
      value: `${lineBreak}${indentationAt(frame.depth)}}`,
    });
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index]!;

      frames.push({
        kind: "value",
        value: (container as Record<string, unknown>)[key],
        arrayElement: false,
        depth: frame.depth + 1,
      });
      frames.push({
        kind: "text",
        value: `${index === 0 ? "" : ","}${lineBreak}${indentationAt(frame.depth + 1)}${JSON.stringify(key)}${separator}`,
      });
    }
  }

  return chunks.join("");
}
