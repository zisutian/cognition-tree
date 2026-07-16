import { describe, expect, it } from "vitest";
import { UnsupportedRepositoryVersionError } from "../../../../contracts/workspace-repository/contractValue.ts";
import { RepositoryCorruptError } from "../../../../server/repository/repositoryStore.ts";
import {
  createWebDavLease,
  createWebDavPointer,
  parseWebDavLease,
  parseWebDavPointer,
  stringifyWebDavControlFile,
} from "../../../../server/adapters/webdav/webDavControlFiles.ts";

const revision = `sha256:${"a".repeat(64)}` as const;

describe("WebDAV v3 control files", () => {
  it("round-trips the exact current pointer schema", () => {
    const pointer = createWebDavPointer(
      "generation-1",
      revision,
      Date.parse("2026-07-16T00:00:00.000Z"),
    );
    const source = stringifyWebDavControlFile(pointer);

    expect(source.endsWith("\n")).toBe(true);
    expect(parseWebDavPointer({ etag: '"pointer"', source })).toEqual(pointer);
  });

  it("rejects legacy versions and unowned pointer fields", () => {
    expect(() => parseWebDavPointer({
      etag: '"legacy"',
      source: JSON.stringify({ schemaVersion: 2 }),
    })).toThrow(UnsupportedRepositoryVersionError);
    expect(() => parseWebDavPointer({
      etag: '"extra"',
      source: JSON.stringify({
        ...createWebDavPointer("generation-1", revision, 0),
        repositoryPath: "/secret/repository",
      }),
    })).toThrow(RepositoryCorruptError);
  });

  it("round-trips the exact writer lease schema and rejects extra fields", () => {
    const lease = createWebDavLease(
      "writer-1",
      Date.parse("2026-07-16T00:01:00.000Z"),
    );
    const resource = {
      etag: '"lease"',
      source: stringifyWebDavControlFile(lease),
    };

    expect(parseWebDavLease(resource)).toEqual(lease);
    expect(() => parseWebDavLease({
      ...resource,
      source: JSON.stringify({ ...lease, owner: "old-writer" }),
    })).toThrow(RepositoryCorruptError);
  });
});
