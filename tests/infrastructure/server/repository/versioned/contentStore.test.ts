// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  FileSystemVersionedContentStore,
  VersionedContentRevisionConflictError,
} from "../../../../../infrastructure/server/repository/versioned/contentStore.ts";

type Content = { value: number };
type Projection = { preparedValue: number };

function revision(value: number) {
  return `sha256:${String(value).padStart(64, "0")}` as const;
}

describe("filesystem versioned content preparation", () => {
  it("checks CAS before raw preparation and caches the committed projection", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctn-content-store-"));
    const filePath = path.join(directory, "content.json");

    try {
      await writeFile(filePath, JSON.stringify({ value: 1 }), { mode: 0o600 });
      const prepareContent = vi.fn(
        (content: Content): Projection => ({ preparedValue: content.value }),
      );
      const store = new FileSystemVersionedContentStore<Content, Projection>(
        filePath,
        {
          createRevision: (content) => revision(content.value),
          normalizeReadError: (error) => error,
          parseContent(value) {
            if (
              typeof value !== "object" || value === null ||
              typeof (value as Partial<Content>).value !== "number"
            ) {
              throw new Error("invalid content");
            }
            return value as Content;
          },
          prepareContent,
          serializeContent: JSON.stringify,
          validateTransition: vi.fn(),
          validateWriteBoundary: (operation) => operation(),
        },
      );
      const before = await store.loadSnapshot();

      expect(prepareContent).toHaveBeenCalledTimes(1);
      await expect(store.commitSnapshot({
        baseRevision: revision(9),
        content: { value: 2 },
      })).rejects.toBeInstanceOf(VersionedContentRevisionConflictError);
      expect(prepareContent).toHaveBeenCalledTimes(1);

      const receipt = await store.commitSnapshot({
        baseRevision: before.revision,
        content: { value: 2 },
      });

      expect(prepareContent).toHaveBeenCalledTimes(2);
      expect(receipt.before).toBe(before);
      expect(receipt.after).toMatchObject({
        content: { value: 2 },
        projection: { preparedValue: 2 },
        revision: revision(2),
      });
      expect(await store.loadSnapshot()).toBe(receipt.after);
      expect(prepareContent).toHaveBeenCalledTimes(2);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
