import { describe, expect, it } from "vitest";
import {
  CtnBlockMetadataSyntaxError,
  formatCtnBlockMetadataLine,
  isCtnBlockId,
  isCtnBlockTimestamp,
  parseCtnBlockMetadataLine,
} from "../../../src/ctn/metadata/blockMetadata";

const blockId = "00000000-0000-4000-8000-000000000001";
const createdAt = "2026-07-15T00:00:00.000Z";
const updatedAt = "2026-07-15T01:00:00.000Z";

describe("CTN block metadata", () => {
  it("round-trips a canonical metadata line with block indentation", () => {
    const line = formatCtnBlockMetadataLine({
      createdAt,
      id: blockId,
      indentText: "\t\t",
      updatedAt,
    });

    expect(line).toBe(
      "\t\t@ctn-block id=00000000-0000-4000-8000-000000000001 created=2026-07-15T00:00:00.000Z updated=2026-07-15T01:00:00.000Z",
    );
    expect(parseCtnBlockMetadataLine(line)).toEqual({
      createdAt,
      id: blockId,
      indentText: "\t\t",
      updatedAt,
    });
  });

  it("distinguishes ordinary source lines from malformed directives", () => {
    expect(parseCtnBlockMetadataLine("\t: ordinary block")).toBeNull();
    expect(() => parseCtnBlockMetadataLine("@ctn-block id=missing-fields"))
      .toThrow(CtnBlockMetadataSyntaxError);
  });

  it("requires canonical UUIDs, ISO UTC timestamps, and whitespace indentation", () => {
    expect(isCtnBlockId(blockId)).toBe(true);
    expect(isCtnBlockId("block-1")).toBe(false);
    expect(isCtnBlockTimestamp(createdAt)).toBe(true);
    expect(isCtnBlockTimestamp("2026-07-15")).toBe(false);

    expect(() => formatCtnBlockMetadataLine({
      createdAt,
      id: "block-1",
      indentText: "",
      updatedAt,
    })).toThrow("Invalid CTN block id");
    expect(() => formatCtnBlockMetadataLine({
      createdAt,
      id: blockId,
      indentText: "prefix",
      updatedAt,
    })).toThrow("indentation must use whitespace");
  });
});
