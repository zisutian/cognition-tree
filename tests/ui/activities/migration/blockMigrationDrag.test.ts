import { describe, expect, it } from "vitest";
import {
  createBlockDragLineNumberPayload,
  readBlockDragLineNumberPayload,
} from "../../../../src/ui/activities/migration/blockMigrationDrag";

describe("block migration drag helpers", () => {
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
