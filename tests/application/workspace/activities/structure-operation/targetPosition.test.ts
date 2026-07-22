import { describe, expect, it } from "vitest";
import {
  parseUiStructureOperationTargetPosition,
} from "../../../../../application/workspace/activities/structure-operation/targetPosition";

describe("structure operation target position adapter", () => {
  it("parses UI target position values into workspace command requests", () => {
    expect(parseUiStructureOperationTargetPosition("end")).toEqual({
      kind: "end",
    });
    expect(parseUiStructureOperationTargetPosition("inside:12")).toEqual({
      kind: "inside-block",
      lineNumber: 12,
    });
    expect(parseUiStructureOperationTargetPosition("sibling-above:12")).toEqual({
      kind: "sibling-above",
      lineNumber: 12,
    });
    expect(parseUiStructureOperationTargetPosition("sibling-below:12")).toEqual({
      kind: "sibling-below",
      lineNumber: 12,
    });
  });

  it("rejects invalid UI target position values", () => {
    expect(() => parseUiStructureOperationTargetPosition("unknown:12")).toThrow(
      "Invalid structure operation target position",
    );
    expect(() => parseUiStructureOperationTargetPosition("inside:0")).toThrow(
      "Invalid structure operation target position",
    );
  });
});
