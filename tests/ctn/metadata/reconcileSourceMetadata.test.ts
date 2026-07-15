import { describe, expect, it } from "vitest";
import { reconcileCtnSourceBlockMetadata } from "../../../src/ctn/metadata/reconcileSourceMetadata";
import { parseCtnDocument } from "../../../src/ctn/parser/parseCtnDocument";
import { defaultCtnSyntaxProfile } from "../../../src/ctn/syntax/defaultSyntaxProfile";
import {
  addTestCtnBlockMetadata,
  createTestBlockId,
  stripTestCtnBlockMetadata,
  testBlockTimestamp,
} from "./sourceMetadataFixture";

const changedTimestamp = "2026-07-15T01:00:00.000Z";

function createIdFactory(offset = 100) {
  let value = offset;
  return () => createTestBlockId(++value);
}

function reconcile(previousSource: string, nextSource: string) {
  return reconcileCtnSourceBlockMetadata(
    previousSource,
    nextSource,
    defaultCtnSyntaxProfile,
    {
      createId: createIdFactory(),
      timestamp: changedTimestamp,
    },
  );
}

describe("reconcileCtnSourceBlockMetadata", () => {
  it("preserves stable ids and updates only a directly edited block", () => {
    const previousSource = addTestCtnBlockMetadata(
      "Title\nRoot\n\t: Child",
    );
    const nextSource = previousSource.replace(": Child", ": Changed");
    const result = parseCtnDocument(
      reconcile(previousSource, nextSource),
      defaultCtnSyntaxProfile,
    );

    expect(result.blocks.map((block) => block.id)).toEqual([
      createTestBlockId(1),
      createTestBlockId(2),
      createTestBlockId(3),
    ]);
    expect(result.blocks.map((block) => block.metadata.updatedAt)).toEqual([
      testBlockTimestamp,
      testBlockTimestamp,
      changedTimestamp,
    ]);
  });

  it("creates metadata for a newly typed block", () => {
    const previousSource = addTestCtnBlockMetadata("Title\nRoot");
    const resultSource = reconcile(
      previousSource,
      `${previousSource}\nSibling`,
    );
    const result = parseCtnDocument(resultSource, defaultCtnSyntaxProfile);

    expect(stripTestCtnBlockMetadata(resultSource)).toBe(
      "Title\nRoot\nSibling",
    );
    expect(result.blocks[2]).toMatchObject({
      id: createTestBlockId(101),
      metadata: {
        createdAt: changedTimestamp,
        updatedAt: changedTimestamp,
      },
    });
  });

  it("assigns a new id to a pasted metadata duplicate", () => {
    const previousSource = addTestCtnBlockMetadata("Title\nRoot");
    const rootPair = previousSource.split("\n").slice(2).join("\n");
    const result = parseCtnDocument(
      reconcile(previousSource, `${previousSource}\n${rootPair}`),
      defaultCtnSyntaxProfile,
    );

    expect(result.blocks.map((block) => block.id)).toEqual([
      createTestBlockId(1),
      createTestBlockId(2),
      createTestBlockId(101),
    ]);
  });

  it("realigns metadata indentation and updates the indented block", () => {
    const previousSource = addTestCtnBlockMetadata("Title\nRoot\n\t: Child");
    const resultSource = reconcile(
      previousSource,
      previousSource.replace("\n\t: Child", "\n\t\t: Child"),
    );
    const result = parseCtnDocument(resultSource, defaultCtnSyntaxProfile);

    expect(result.blocks[2]).toMatchObject({
      id: createTestBlockId(3),
      indentText: "\t\t",
      metadata: { updatedAt: changedTimestamp },
    });
    expect(resultSource).toContain(
      `\t\t@ctn-block id=${createTestBlockId(3)}`,
    );
  });

  it("keeps reserved-looking text inside multiline block content", () => {
    const rawSource = [
      "Title",
      "\t```text",
      "\t@ctn-block id=example",
      "\t```",
    ].join("\n");
    const previousSource = addTestCtnBlockMetadata(rawSource);
    const resultSource = reconcile(
      previousSource,
      `${previousSource}\nSibling`,
    );

    expect(resultSource).toContain("\t@ctn-block id=example");
    expect(
      parseCtnDocument(resultSource, defaultCtnSyntaxProfile).blocks,
    ).toHaveLength(3);
  });
});
