import { describe, expect, it } from "vitest";
import {
  parseUiBlockMigrationTargetPosition,
} from "../../../../src/application/workspace/view-model/migrationTargetPosition";

describe("migration target position adapter", () => {
  it("parses UI target position values into workspace command requests", () => {
    expect(parseUiBlockMigrationTargetPosition("end")).toEqual({
      kind: "end",
    });
    expect(parseUiBlockMigrationTargetPosition("inside:12")).toEqual({
      kind: "inside-block",
      lineNumber: 12,
    });
    expect(parseUiBlockMigrationTargetPosition("sibling-above:12")).toEqual({
      kind: "sibling-above",
      lineNumber: 12,
    });
    expect(parseUiBlockMigrationTargetPosition("sibling-below:12")).toEqual({
      kind: "sibling-below",
      lineNumber: 12,
    });
  });

  it("rejects invalid UI target position values", () => {
    expect(() => parseUiBlockMigrationTargetPosition("unknown:12")).toThrow(
      "Invalid block migration target position",
    );
    expect(() => parseUiBlockMigrationTargetPosition("inside:0")).toThrow(
      "Invalid block migration target position",
    );
  });
});
