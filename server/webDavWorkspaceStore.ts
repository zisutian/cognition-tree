// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { parseWorkspaceRepositoryCommit } from "../contracts/workspace-repository/parseRepository.ts";
import {
  repositorySyntaxFileName,
  type WorkspaceRepositoryContentDto,
  type WorkspaceRepositorySnapshotDto,
} from "../contracts/workspace-repository/types.ts";
import {
  RepositoryAdapterError,
  WorkspaceRevisionConflictError,
  type WorkspaceRepositoryStore,
} from "./repositoryAdapter.ts";
import {
  createEmptyRepositoryWorkspace,
  createRepositoryNoteFileName,
  createWorkspaceRepositoryFileSet,
  loadWorkspaceFromManifest,
  notesDirName,
  syntaxDirName,
  workspaceFileName,
} from "./workspaceRepositoryLayout.ts";
import { createWorkspaceRepositoryRevision } from "./workspaceRepositoryRevision.ts";
import {
  WebDavRequestError,
  type WebDavTextResource,
  type WebDavTransport,
} from "./webDavTransport.ts";

const lockPath = ".ctn-lock.json";
const journalPath = ".ctn-journal.json";
const transactionVersion = 1;
const defaultLockLeaseMs = 60_000;

export const webDavCommitPhases = {
  locked: "locked",
  staged: "staged",
  journaled: "journaled",
  filesApplied: "files-applied",
  manifestApplied: "manifest-applied",
  validated: "validated",
  cleaned: "cleaned",
} as const;

export type WebDavCommitPhase =
  (typeof webDavCommitPhases)[keyof typeof webDavCommitPhases];

type WebDavLock = {
  acquiredAt: string;
  stagingDir: string;
  token: string;
  version: typeof transactionVersion;
};

type WebDavJournal = {
  hasSyntax: boolean;
  lockToken: string;
  previousNoteIds: string[];
  stagingDir: string;
  targetNoteIds: string[];
  targetRevision: string;
  version: typeof transactionVersion;
};

type WebDavWorkspaceStoreOptions = {
  createId?: () => string;
  lockLeaseMs?: number;
  now?: () => number;
  onCommitPhase?: (phase: WebDavCommitPhase) => Promise<void> | void;
  repositoryPath: string;
  transport: WebDavTransport;
};

function stringifyControlFile(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseObject(source: string, label: string) {
  let value: unknown;

  try {
    value = JSON.parse(source);
  } catch {
    throw new Error(`Invalid WebDAV ${label}`);
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid WebDAV ${label}`);
  }

  return value as Record<string, unknown>;
}

function readStringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Invalid WebDAV ${label}`);
  }

  return value as string[];
}

function parseLock(resource: WebDavTextResource): WebDavLock {
  const value = parseObject(resource.source, "lock");

  if (
    value.version !== transactionVersion ||
    typeof value.acquiredAt !== "string" ||
    !Number.isFinite(Date.parse(value.acquiredAt)) ||
    typeof value.stagingDir !== "string" ||
    !value.stagingDir.startsWith(".ctn-stage-") ||
    typeof value.token !== "string" ||
    value.token.length === 0
  ) {
    throw new Error("Invalid WebDAV lock");
  }

  return {
    acquiredAt: value.acquiredAt,
    stagingDir: value.stagingDir,
    token: value.token,
    version: transactionVersion,
  };
}

function parseJournal(resource: WebDavTextResource): WebDavJournal {
  const value = parseObject(resource.source, "journal");

  if (
    value.version !== transactionVersion ||
    typeof value.hasSyntax !== "boolean" ||
    typeof value.lockToken !== "string" ||
    typeof value.stagingDir !== "string" ||
    !value.stagingDir.startsWith(".ctn-stage-") ||
    typeof value.targetRevision !== "string" ||
    value.targetRevision.length === 0
  ) {
    throw new Error("Invalid WebDAV journal");
  }

  return {
    hasSyntax: value.hasSyntax,
    lockToken: value.lockToken,
    previousNoteIds: readStringArray(
      value.previousNoteIds,
      "journal previous note ids",
    ),
    stagingDir: value.stagingDir,
    targetNoteIds: readStringArray(
      value.targetNoteIds,
      "journal target note ids",
    ),
    targetRevision: value.targetRevision,
    version: transactionVersion,
  };
}

export class WebDavRepositoryBusyError extends RepositoryAdapterError {
  constructor() {
    super(423, "WebDAV repository is locked by another operation");
    this.name = "WebDavRepositoryBusyError";
  }
}

function isExpectedStoreError(error: unknown) {
  return error instanceof RepositoryAdapterError ||
    error instanceof WorkspaceRevisionConflictError;
}

export class WebDavWorkspaceStore implements WorkspaceRepositoryStore {
  #createId: () => string;
  #lockLeaseMs: number;
  #now: () => number;
  #onCommitPhase: NonNullable<WebDavWorkspaceStoreOptions["onCommitPhase"]>;
  #operationQueue: Promise<void> = Promise.resolve();
  #recoverableTokens = new Set<string>();
  #repositoryPath: string;
  #transport: WebDavTransport;

  constructor({
    createId = randomUUID,
    lockLeaseMs = defaultLockLeaseMs,
    now = Date.now,
    onCommitPhase = async () => {},
    repositoryPath,
    transport,
  }: WebDavWorkspaceStoreOptions) {
    this.#createId = createId;
    this.#lockLeaseMs = lockLeaseMs;
    this.#now = now;
    this.#onCommitPhase = onCommitPhase;
    this.#repositoryPath = repositoryPath;
    this.#transport = transport;
  }

  async loadSnapshot() {
    return this.#enqueueOperation(async () => {
      try {
        await this.#recover();
        return await this.#loadSnapshot();
      } catch (error) {
        throw this.#mapFailure(error);
      }
    });
  }

  async commitSnapshot(value: unknown) {
    const commit = parseWorkspaceRepositoryCommit(value);

    return this.#enqueueOperation(async () => {
      try {
        await this.#recover();
        return await this.#commitSnapshot(commit);
      } catch (error) {
        throw this.#mapFailure(error);
      }
    });
  }

  async #commitSnapshot(
    commit: ReturnType<typeof parseWorkspaceRepositoryCommit>,
  ) {
    const token = this.#createId();
    const stagingDir = `.ctn-stage-${token}`;
    const lock: WebDavLock = {
      acquiredAt: new Date(this.#now()).toISOString(),
      stagingDir,
      token,
      version: transactionVersion,
    };
    let journalWritten = false;

    await this.#acquireLock(lock);

    try {
      await this.#onCommitPhase(webDavCommitPhases.locked);
      const currentContent = await this.#readContent();
      const currentRevision = createWorkspaceRepositoryRevision(currentContent);

      if (currentRevision !== commit.baseRevision) {
        throw new WorkspaceRevisionConflictError(currentRevision);
      }

      const targetContent = {
        syntaxSourceFile: commit.syntaxSourceFile,
        workspace: commit.workspace,
      };
      const targetRevision = createWorkspaceRepositoryRevision(targetContent);
      const journal: WebDavJournal = {
        hasSyntax: commit.syntaxSourceFile !== null,
        lockToken: token,
        previousNoteIds: currentContent.workspace.notes.map((note) => note.id),
        stagingDir,
        targetNoteIds: commit.workspace.notes.map((note) => note.id),
        targetRevision,
        version: transactionVersion,
      };

      await this.#stageContent(stagingDir, targetContent);
      await this.#onCommitPhase(webDavCommitPhases.staged);
      await this.#transport.writeText(
        journalPath,
        stringifyControlFile(journal),
        { ifNoneMatch: "*" },
      );
      journalWritten = true;
      await this.#onCommitPhase(webDavCommitPhases.journaled);
      await this.#applyJournal(journal);
      await this.#validateRevision(targetRevision);
      await this.#onCommitPhase(webDavCommitPhases.validated);
      await this.#cleanupTransaction(lock);
      await this.#onCommitPhase(webDavCommitPhases.cleaned);
      return { revision: targetRevision };
    } catch (error) {
      if (journalWritten) {
        this.#recoverableTokens.add(token);
      } else {
        await this.#removeTransactionArtifacts(lock);
      }

      throw error;
    }
  }

  async #acquireLock(lock: WebDavLock) {
    try {
      await this.#transport.writeText(
        lockPath,
        stringifyControlFile(lock),
        { ifNoneMatch: "*" },
      );
    } catch (error) {
      if (!(error instanceof WebDavRequestError) || error.statusCode !== 412) {
        throw error;
      }

      await this.#recover();
      await this.#transport.writeText(
        lockPath,
        stringifyControlFile(lock),
        { ifNoneMatch: "*" },
      );
    }
  }

  async #stageContent(
    stagingDir: string,
    content: WorkspaceRepositoryContentDto,
  ) {
    const { files } = createWorkspaceRepositoryFileSet(content);

    await this.#transport.createCollection(stagingDir);
    await this.#transport.createCollection(`${stagingDir}/${notesDirName}`);
    await this.#transport.createCollection(`${stagingDir}/${syntaxDirName}`);

    for (const [relativePath, source] of files) {
      await this.#transport.writeText(`${stagingDir}/${relativePath}`, source);
    }
  }

  async #applyJournal(journal: WebDavJournal) {
    await this.#transport.createCollection(notesDirName);
    await this.#transport.createCollection(syntaxDirName);

    for (const noteId of journal.targetNoteIds) {
      const fileName = createRepositoryNoteFileName(noteId);

      await this.#transport.move(
        `${journal.stagingDir}/${notesDirName}/${fileName}`,
        `${notesDirName}/${fileName}`,
      );
    }

    const targetNoteIds = new Set(journal.targetNoteIds);

    for (const noteId of journal.previousNoteIds) {
      if (!targetNoteIds.has(noteId)) {
        await this.#transport.remove(
          `${notesDirName}/${createRepositoryNoteFileName(noteId)}`,
        );
      }
    }

    const syntaxPath = `${syntaxDirName}/${repositorySyntaxFileName}`;

    if (journal.hasSyntax) {
      await this.#transport.move(
        `${journal.stagingDir}/${syntaxPath}`,
        syntaxPath,
      );
    } else {
      await this.#transport.remove(syntaxPath);
    }

    await this.#onCommitPhase(webDavCommitPhases.filesApplied);
    await this.#transport.move(
      `${journal.stagingDir}/${workspaceFileName}`,
      workspaceFileName,
    );
    await this.#onCommitPhase(webDavCommitPhases.manifestApplied);
  }

  async #loadSnapshot(): Promise<WorkspaceRepositorySnapshotDto> {
    const content = await this.#readContent();

    return {
      ...content,
      repositoryPath: this.#repositoryPath,
      revision: createWorkspaceRepositoryRevision(content),
    };
  }

  async #readContent(): Promise<WorkspaceRepositoryContentDto> {
    const manifestResource = await this.#transport.readText(workspaceFileName);

    if (!manifestResource) {
      return {
        syntaxSourceFile: null,
        workspace: createEmptyRepositoryWorkspace(),
      };
    }

    const manifest = parseObject(manifestResource.source, "workspace manifest");
    const workspace = await loadWorkspaceFromManifest(
      manifest,
      async (noteId) => {
        const relativePath = `${notesDirName}/${createRepositoryNoteFileName(noteId)}`;
        const resource = await this.#transport.readText(relativePath);

        if (!resource) {
          throw new Error(`Missing note source file: ${relativePath}`);
        }

        return resource.source;
      },
    );
    const syntaxResource = await this.#transport.readText(
      `${syntaxDirName}/${repositorySyntaxFileName}`,
    );

    return {
      syntaxSourceFile: syntaxResource
        ? { fileName: repositorySyntaxFileName, source: syntaxResource.source }
        : null,
      workspace,
    };
  }

  async #recover() {
    const journalResource = await this.#transport.readText(journalPath);
    const lockResource = await this.#transport.readText(lockPath);

    if (!journalResource) {
      if (lockResource) {
        const lock = parseLock(lockResource);

        if (!this.#canRecoverLock(lock)) {
          throw new WebDavRepositoryBusyError();
        }

        await this.#removeTransactionArtifacts(lock, lockResource.etag);
      }
      return;
    }

    const journal = parseJournal(journalResource);
    const lock = lockResource ? parseLock(lockResource) : null;

    if (
      lock &&
      lock.token !== journal.lockToken &&
      !this.#canRecoverLock(lock)
    ) {
      throw new WebDavRepositoryBusyError();
    }

    if (lock && !this.#canRecoverLock(lock)) {
      throw new WebDavRepositoryBusyError();
    }

    await this.#applyJournal(journal);
    await this.#validateRevision(journal.targetRevision);
    await this.#transport.remove(journalPath, {
      ifMatch: journalResource.etag ?? undefined,
    });
    await this.#transport.remove(journal.stagingDir);

    if (lockResource) {
      await this.#transport.remove(lockPath, {
        ifMatch: lockResource.etag ?? undefined,
      });
    }
    this.#recoverableTokens.delete(journal.lockToken);
  }

  #canRecoverLock(lock: WebDavLock) {
    return this.#recoverableTokens.has(lock.token) ||
      this.#now() - Date.parse(lock.acquiredAt) >= this.#lockLeaseMs;
  }

  async #validateRevision(expectedRevision: string) {
    const content = await this.#readContent();
    const actualRevision = createWorkspaceRepositoryRevision(content);

    if (actualRevision !== expectedRevision) {
      throw new Error(
        `WebDAV transaction validation failed: expected ${expectedRevision}, received ${actualRevision}`,
      );
    }
  }

  async #cleanupTransaction(lock: WebDavLock) {
    await this.#transport.remove(journalPath);
    await this.#transport.remove(lock.stagingDir);
    await this.#transport.remove(lockPath);
    this.#recoverableTokens.delete(lock.token);
  }

  async #removeTransactionArtifacts(lock: WebDavLock, lockEtag?: string | null) {
    await this.#transport.remove(lock.stagingDir);
    await this.#transport.remove(lockPath, {
      ifMatch: lockEtag ?? undefined,
    });
    this.#recoverableTokens.delete(lock.token);
  }

  #mapFailure(error: unknown) {
    if (isExpectedStoreError(error)) {
      return error;
    }

    if (error instanceof WebDavRequestError) {
      return new RepositoryAdapterError(
        error.statusCode === 401 || error.statusCode === 403 ? 502 : 503,
        "WebDAV repository request failed",
      );
    }

    if (error instanceof TypeError) {
      return new RepositoryAdapterError(
        503,
        "WebDAV repository is unavailable",
      );
    }

    return error;
  }

  #enqueueOperation<Result>(operation: () => Promise<Result>) {
    const result = this.#operationQueue.then(operation);

    this.#operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
