// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  FileSystemVersionedContentStore,
  VersionedContentCommitOutcomeUnknownError,
  VersionedContentRevisionConflictError,
} from "../../../../../infrastructure/server/repository/versioned/contentStore.ts";
import {
  replaceFileDurably,
} from "../../../../../infrastructure/server/persistence/fileSystemPersistence.ts";

type Content = { value: number };
type Projection = { preparedValue: number };

function revision(value: number) {
  return `sha256:${String(value).padStart(64, "0")}` as const;
}

describe("filesystem versioned content preparation", () => {
  it("bounds both persisted and newly serialized content", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctn-content-size-"));
    const filePath = path.join(directory, "content.json");
    const definition = {
      createRevision: (content: Content) => revision(content.value),
      normalizeReadError: (error: unknown) => error,
      parseContent: (value: unknown) => value as Content,
      prepareContent: (content: Content) => ({ preparedValue: content.value }),
      serializeContent: (content: Content) => JSON.stringify({
        ...content,
        padding: "x".repeat(64),
      }),
      validateTransition: vi.fn(),
      validateWriteBoundary: <Result>(operation: () => Result) => operation(),
    };

    try {
      await writeFile(filePath, JSON.stringify({ value: 1 }), { mode: 0o600 });
      const store = new FileSystemVersionedContentStore<Content, Projection>(
        filePath,
        definition,
        { maximumBytes: 32 },
      );
      const before = await store.loadSnapshot();

      await expect(store.commit({
        baseRevision: before.revision,
        content: { value: 2 },
        projection: { preparedValue: 2 },
      })).rejects.toMatchObject({ code: "invalid_request" });

      await writeFile(filePath, " ".repeat(33), { mode: 0o600 });
      const oversized = new FileSystemVersionedContentStore<Content, Projection>(
        filePath,
        definition,
        { maximumBytes: 32 },
      );

      await expect(oversized.loadSnapshot()).rejects.toThrow(/size limit/i);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("checks CAS and caches the supplied prepared projection without rebuilding it", async () => {
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
      await expect(store.commit({
        baseRevision: revision(9),
        content: { value: 2 },
        projection: { preparedValue: 2 },
      })).rejects.toBeInstanceOf(VersionedContentRevisionConflictError);
      expect(prepareContent).toHaveBeenCalledTimes(1);

      const projection = { preparedValue: 2 };
      const receipt = await store.commit({
        baseRevision: before.revision,
        content: { value: 2 },
        projection,
      });

      expect(prepareContent).toHaveBeenCalledTimes(1);
      expect(receipt.before).toBe(before);
      expect(receipt.after.projection).toBe(projection);
      expect(receipt.after).toMatchObject({
        content: { value: 2 },
        projection: { preparedValue: 2 },
        revision: revision(2),
      });
      expect(await store.loadSnapshot()).toBe(receipt.after);
      expect(prepareContent).toHaveBeenCalledTimes(1);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("recovers the authoritative receipt when replacement completed before reporting failure", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "ctn-content-recovery-"),
    );
    const filePath = path.join(directory, "content.json");

    try {
      await writeFile(filePath, JSON.stringify({ value: 1 }), { mode: 0o600 });
      const store = new FileSystemVersionedContentStore<Content, Projection>(
        filePath,
        {
          createRevision: (content) => revision(content.value),
          normalizeReadError: (error) => error,
          parseContent: (value) => value as Content,
          prepareContent: (content) => ({ preparedValue: content.value }),
          serializeContent: JSON.stringify,
          validateTransition: vi.fn(),
          validateWriteBoundary: (operation) => operation(),
        },
        {
          replaceContent: async (content) => {
            await replaceFileDurably(filePath, content, {
              hiddenTemporaryFile: true,
            });
            throw new Error("replacement acknowledgement failed");
          },
        },
      );
      const before = await store.loadSnapshot();
      const projection = { preparedValue: 2 };
      const receipt = await store.commit({
        baseRevision: before.revision,
        content: { value: 2 },
        projection,
      });

      expect(receipt).toMatchObject({
        after: { content: { value: 2 }, revision: revision(2) },
        before: { revision: revision(1) },
        revision: revision(2),
      });
      expect(receipt.after.projection).toBe(projection);
      expect(await store.loadSnapshot()).toBe(receipt.after);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("fails closed when a visible candidate cannot be made durably authoritative", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "ctn-content-unknown-"),
    );
    const filePath = path.join(directory, "content.json");

    try {
      await writeFile(filePath, JSON.stringify({ value: 1 }), { mode: 0o600 });
      const store = new FileSystemVersionedContentStore<Content, Projection>(
        filePath,
        {
          createRevision: (content) => revision(content.value),
          normalizeReadError: (error) => error,
          parseContent: (value) => value as Content,
          prepareContent: (content) => ({ preparedValue: content.value }),
          serializeContent: JSON.stringify,
          validateTransition: vi.fn(),
          validateWriteBoundary: (operation) => operation(),
        },
        {
          replaceContent: async (content) => {
            await replaceFileDurably(filePath, content, {
              hiddenTemporaryFile: true,
            });
            throw new Error("replacement acknowledgement failed");
          },
          synchronizeDirectory: async () => {
            throw new Error("directory synchronization failed");
          },
        },
      );
      const before = await store.loadSnapshot();
      let failure: unknown;

      try {
        await store.commit({
          baseRevision: before.revision,
          content: { value: 2 },
          projection: { preparedValue: 2 },
        });
      } catch (error) {
        failure = error;
      }

      expect(failure).toBeInstanceOf(
        VersionedContentCommitOutcomeUnknownError,
      );
      expect(failure).toMatchObject({
        commitOutcome: "unknown",
        currentRevision: revision(2),
      });
      await expect(store.loadSnapshot()).rejects.toBe(failure);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("preserves a committed receipt when lock cleanup fails and closes the store", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "ctn-content-lock-"),
    );
    const filePath = path.join(directory, "content.json");

    try {
      await writeFile(filePath, JSON.stringify({ value: 1 }), { mode: 0o600 });
      const store = new FileSystemVersionedContentStore<Content, Projection>(
        filePath,
        {
          createRevision: (content) => revision(content.value),
          normalizeReadError: (error) => error,
          parseContent: (value) => value as Content,
          prepareContent: (content) => ({ preparedValue: content.value }),
          serializeContent: JSON.stringify,
          validateTransition: vi.fn(),
          validateWriteBoundary: (operation) => operation(),
        },
        {
          acquireLock: async () => async () => {
            throw new Error("lock release failed");
          },
        },
      );
      const before = await store.loadSnapshot();

      await expect(store.commit({
        baseRevision: before.revision,
        content: { value: 2 },
        projection: { preparedValue: 2 },
      })).resolves.toMatchObject({ revision: revision(2) });
      await expect(store.loadSnapshot()).rejects.toMatchObject({
        code: "adapter_unavailable",
        message: "Versioned content lock could not be released",
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
