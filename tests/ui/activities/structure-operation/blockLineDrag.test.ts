import { describe, expect, it } from "vitest";
import {
  createBlockLineDragPayload,
  readBlockLineDragPayload,
} from "../../../../src/ui/activities/structure-operation/blockLineDrag";

describe("block line drag helpers", () => {
  it("reads typed drag payload before plain text payloads", () => {
    expect(createBlockLineDragPayload(5)).toBe("5");
    expect(
      readBlockLineDragPayload({
        plainText: "4",
        typedPayload: "5",
      }),
    ).toBe("5");
    expect(
      readBlockLineDragPayload({
        plainText: "4",
        typedPayload: "",
      }),
    ).toBe("4");
  });

  it("rejects missing or invalid drag payloads", () => {
    expect(
      readBlockLineDragPayload({
        plainText: "",
        typedPayload: "",
      }),
    ).toBeNull();
    expect(
      readBlockLineDragPayload({
        plainText: "not-a-line",
        typedPayload: "",
      }),
    ).toBeNull();
    expect(
      readBlockLineDragPayload({
        plainText: "0",
        typedPayload: "",
      }),
    ).toBeNull();
  });
});
