import { describe, expect, it } from "vitest";
import {
  createBlockDragLineNumberPayload,
  createBlockMigrationTargetPositionValue,
  parseBlockMigrationTargetPosition,
  readBlockDragLineNumberPayload,
} from "../../../../src/ui/activities/migration/blockMigrationDrag";

describe("block migration drag helpers", () => {
  it("parses explicit migration target positions", () => {
    expect(parseBlockMigrationTargetPosition("end")).toEqual({
      kind: "end",
    });
    expect(parseBlockMigrationTargetPosition("inside:12")).toEqual({
      kind: "inside-block",
      lineNumber: 12,
    });
    expect(parseBlockMigrationTargetPosition("sibling-above:12")).toEqual({
      kind: "sibling-above",
      lineNumber: 12,
    });
    expect(parseBlockMigrationTargetPosition("sibling-below:12")).toEqual({
      kind: "sibling-below",
      lineNumber: 12,
    });
    expect(() => parseBlockMigrationTargetPosition("unknown:12")).toThrow(
      "Invalid block migration target position",
    );
    expect(() => parseBlockMigrationTargetPosition("inside:0")).toThrow(
      "Invalid block migration target position",
    );
  });

  it("serializes migration target positions", () => {
    expect(createBlockMigrationTargetPositionValue({ kind: "end" })).toBe(
      "end",
    );
    expect(
      createBlockMigrationTargetPositionValue({
        kind: "inside-block",
        lineNumber: 7,
      }),
    ).toBe("inside:7");
    expect(
      createBlockMigrationTargetPositionValue({
        kind: "sibling-above",
        lineNumber: 7,
      }),
    ).toBe("sibling-above:7");
    expect(
      createBlockMigrationTargetPositionValue({
        kind: "sibling-below",
        lineNumber: 7,
      }),
    ).toBe("sibling-below:7");
  });

  it("reads typed drag payload before plain text payloads", () => {
    expect(createBlockDragLineNumberPayload(5)).toBe("5");
    expect(
      readBlockDragLineNumberPayload({
        plainText: "4",
        typedPayload: "5",
      }),
    ).toBe("5");
    expect(
      readBlockDragLineNumberPayload({
        plainText: "4",
        typedPayload: "",
      }),
    ).toBe("4");
  });

  it("rejects missing or invalid drag payloads", () => {
    expect(
      readBlockDragLineNumberPayload({
        plainText: "",
        typedPayload: "",
      }),
    ).toBeNull();
    expect(
      readBlockDragLineNumberPayload({
        plainText: "not-a-line",
        typedPayload: "",
      }),
    ).toBeNull();
    expect(
      readBlockDragLineNumberPayload({
        plainText: "0",
        typedPayload: "",
      }),
    ).toBeNull();
  });
});
