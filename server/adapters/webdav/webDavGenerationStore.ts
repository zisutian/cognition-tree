// SPDX-License-Identifier: GPL-3.0-or-later

import { WorkspaceRepositoryContractError } from "../../../contracts/workspace-repository/contractValue.ts";
import {
  repositorySyntaxFileName,
  workspaceRepositorySchemaVersion,
  type RepositoryRevisionDto,
  type WorkspaceRepositoryContentDto,
} from "../../../contracts/workspace-repository/types.ts";
import { RepositoryCorruptError } from "../../repository/repositoryStore.ts";
import {
  createRepositoryNoteFileName,
  createWorkspaceSnapshotFileSet,
  loadWorkspaceFromSnapshot,
  notesDirName,
  syntaxDirName,
  workspaceFileName,
  WorkspacePayloadValidationError,
} from "../../repository/workspaceRepositoryLayout.ts";
import { createWorkspaceRepositoryRevision } from "../../repository/workspaceRepositoryRevision.ts";
import {
  webDavGenerationsPath,
  type WebDavPointer,
} from "./webDavControlFiles.ts";
import type { WebDavTransport } from "./webDavTransport.ts";
import {
  type ActiveWebDavLease,
  WebDavWriterLeaseCoordinator,
} from "./webDavWriterLease.ts";

const orphanGenerationAgeMs = 24 * 60 * 60 * 1_000;
const generationUploadConcurrency = 8;

async function runWithConcurrency(
  entries: Array<[string, string]>,
  concurrency: number,
  action: (entry: [string, string]) => Promise<void>,
) {
  let index = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, entries.length) },
    async () => {
      while (index < entries.length) {
        const entry = entries[index];
        index += 1;
        if (entry) {
          await action(entry);
        }
      }
    },
  );

  await Promise.all(workers);
}

type WebDavGenerationStoreOptions = {
  leaseCoordinator: WebDavWriterLeaseCoordinator;
  now: () => number;
  transport: WebDavTransport;
};

export class WebDavGenerationStore {
  readonly #leaseCoordinator: WebDavWriterLeaseCoordinator;
  readonly #now: () => number;
  readonly #transport: WebDavTransport;

  constructor({ leaseCoordinator, now, transport }: WebDavGenerationStoreOptions) {
    this.#leaseCoordinator = leaseCoordinator;
    this.#now = now;
    this.#transport = transport;
  }

  read(pointer: WebDavPointer): Promise<WorkspaceRepositoryContentDto> {
    return this.readContent(pointer.generation, pointer.revision);
  }

  async readContent(
    generation: string,
    expectedRevision?: RepositoryRevisionDto,
  ): Promise<WorkspaceRepositoryContentDto> {
    const generationPath = `${webDavGenerationsPath}/${generation}`;
    const workspaceResource = await this.#transport.readText(
      `${generationPath}/${workspaceFileName}`,
    );

    if (!workspaceResource) {
      throw new RepositoryCorruptError("WebDAV generation is missing workspace.json");
    }
    try {
      const workspace = await loadWorkspaceFromSnapshot(
        JSON.parse(workspaceResource.source) as unknown,
        async (noteId) => {
          const resource = await this.#transport.readText(
            `${generationPath}/${notesDirName}/${createRepositoryNoteFileName(noteId)}`,
          );

          if (!resource) {
            throw new RepositoryCorruptError("WebDAV generation is missing a note source");
          }
          return resource.source;
        },
      );
      const syntaxResource = await this.#transport.readText(
        `${generationPath}/${syntaxDirName}/${repositorySyntaxFileName}`,
      );
      const content: WorkspaceRepositoryContentDto = {
        schemaVersion: workspaceRepositorySchemaVersion,
        syntaxSource: syntaxResource?.source ?? null,
        workspace,
      };
      const revision = createWorkspaceRepositoryRevision(content);

      if (expectedRevision && revision !== expectedRevision) {
        throw new RepositoryCorruptError(
          "WebDAV generation hash does not match current pointer",
        );
      }
      return content;
    } catch (error) {
      if (error instanceof RepositoryCorruptError) {
        throw error;
      }
      if (
        error instanceof SyntaxError ||
        error instanceof WorkspaceRepositoryContractError ||
        error instanceof WorkspacePayloadValidationError
      ) {
        throw new RepositoryCorruptError("WebDAV generation content is invalid");
      }
      throw error;
    }
  }

  async upload(
    generation: string,
    content: WorkspaceRepositoryContentDto,
    lease: ActiveWebDavLease,
  ) {
    const generationPath = `${webDavGenerationsPath}/${generation}`;

    this.#leaseCoordinator.assertLocallyActive(lease);
    await this.#transport.createCollection(webDavGenerationsPath);
    this.#leaseCoordinator.assertLocallyActive(lease);
    await this.#transport.createCollection(generationPath);
    this.#leaseCoordinator.assertLocallyActive(lease);
    await this.#transport.createCollection(`${generationPath}/${notesDirName}`);
    this.#leaseCoordinator.assertLocallyActive(lease);
    await this.#transport.createCollection(`${generationPath}/${syntaxDirName}`);
    const files = [...createWorkspaceSnapshotFileSet(content).entries()];

    await runWithConcurrency(
      files,
      generationUploadConcurrency,
      async ([relativePath, source]) => {
        this.#leaseCoordinator.assertLocallyActive(lease);
        await this.#transport.writeText(`${generationPath}/${relativePath}`, source, {
          ifNoneMatch: "*",
        });
        this.#leaseCoordinator.assertLocallyActive(lease);
      },
    );
  }

  async validate(generation: string, revision: RepositoryRevisionDto) {
    await this.readContent(generation, revision);
  }

  async garbageCollect(currentGeneration: string, lease: ActiveWebDavLease) {
    await this.#leaseCoordinator.assertHeld(lease);
    const entries = await this.#transport.listCollection(webDavGenerationsPath);
    const orphanPaths = entries
      .filter((entry) => {
        const relative = entry.path.startsWith(`${webDavGenerationsPath}/`)
          ? entry.path.slice(webDavGenerationsPath.length + 1)
          : entry.path;

        return (
          !relative.includes("/") &&
          relative !== currentGeneration &&
          entry.lastModified !== null &&
          this.#now() - entry.lastModified >= orphanGenerationAgeMs
        );
      })
      .map((entry) =>
        entry.path.startsWith(`${webDavGenerationsPath}/`)
          ? entry.path
          : `${webDavGenerationsPath}/${entry.path}`,
      );

    for (const orphanPath of orphanPaths) {
      await this.#leaseCoordinator.assertHeld(lease);
      await this.#transport.remove(orphanPath);
    }
  }
}
