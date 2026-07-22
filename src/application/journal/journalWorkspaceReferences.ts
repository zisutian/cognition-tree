// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createPortableNameKey,
  getPortableNameIssue,
} from "../../../portable-name/portableName";
import type { JournalWorkspaceReference } from "../../../journal/indexes/journalParseIndex";
import {
  readWorkspaceNoteHeader,
  type WorkspaceData,
} from "../../workspace/model/workspaceData";
import type {
  WorkspaceRepositoryCatalog,
  WorkspaceRepositoryDescriptor,
} from "../../storage/repository/workspaceRepositoryCatalog";

export type JournalWorkspaceReferenceFaultCode =
  | "note-ambiguous"
  | "note-not-found"
  | "repository-name-invalid"
  | "repository-not-found"
  | "repository-unreadable";

export type JournalWorkspaceNoteDestination = {
  description: string;
  id: string;
  kind: "workspace-note";
  label: string;
  lineNumber: 1;
  noteId: string;
  repositoryId: string;
};

export type JournalWorkspaceReferenceResolution =
  | {
      destination: JournalWorkspaceNoteDestination;
      reference: JournalWorkspaceReference;
      status: "resolved";
    }
  | {
      code: JournalWorkspaceReferenceFaultCode;
      message: string;
      reference: JournalWorkspaceReference;
      status: "fault";
    };

export type JournalWorkspaceReferenceResolutionState =
  | { status: "idle" | "loading" }
  | {
      resolutions: JournalWorkspaceReferenceResolution[];
      status: "ready";
    };

export type JournalWorkspaceReferenceResolver = {
  resolve(
    references: readonly JournalWorkspaceReference[],
  ): Promise<JournalWorkspaceReferenceResolution[]>;
};

export type JournalWorkspaceReferenceSnapshot = {
  repositoryId: string;
  workspace: WorkspaceData;
};

export type JournalWorkspaceReferenceResolutionPublisher = (
  state: JournalWorkspaceReferenceResolutionState,
) => void;

export function startJournalWorkspaceReferenceResolution({
  publish,
  references,
  resolver,
}: {
  publish: JournalWorkspaceReferenceResolutionPublisher;
  references: readonly JournalWorkspaceReference[];
  resolver: JournalWorkspaceReferenceResolver | null;
}) {
  if (references.length === 0) {
    publish({ resolutions: [], status: "ready" });
    return () => undefined;
  }
  if (!resolver) {
    publish({ status: "idle" });
    return () => undefined;
  }
  let cancelled = false;

  publish({ status: "loading" });
  void resolver.resolve(references).then((resolutions) => {
    if (!cancelled) {
      publish({ resolutions, status: "ready" });
    }
  });
  return () => {
    cancelled = true;
  };
}

export async function routeJournalWorkspaceNoteDestination({
  activeRepositoryId,
  destination,
  flushCurrentSession,
  openNoteLine,
  selectRepository,
}: {
  activeRepositoryId: string | null;
  destination: JournalWorkspaceNoteDestination;
  flushCurrentSession: () => Promise<void>;
  openNoteLine: (noteId: string, lineNumber: number) => void;
  selectRepository: (repositoryId: string) => Promise<void>;
}) {
  if (activeRepositoryId === destination.repositoryId) {
    openNoteLine(destination.noteId, destination.lineNumber);
    return "opened" as const;
  }
  await flushCurrentSession();
  await selectRepository(destination.repositoryId);
  return "switched" as const;
}

export async function routeJournalWorkspaceNoteDestinationWithoutSession(
  destination: JournalWorkspaceNoteDestination,
  selectRepository: (repositoryId: string) => Promise<void>,
) {
  await selectRepository(destination.repositoryId);
  return "switched" as const;
}

function createFault(
  reference: JournalWorkspaceReference,
  code: JournalWorkspaceReferenceFaultCode,
  message: string,
): JournalWorkspaceReferenceResolution {
  return { code, message, reference, status: "fault" };
}

function matchRepository(
  repositories: readonly WorkspaceRepositoryDescriptor[],
  reference: JournalWorkspaceReference,
) {
  const key = createPortableNameKey(reference.repositoryName);
  const matches = repositories.filter(
    ({ label }) => createPortableNameKey(label) === key,
  );

  if (matches.length === 0) {
    return createFault(
      reference,
      "repository-not-found",
      `找不到普通仓库“${reference.repositoryName}”。`,
    );
  }
  if (matches.length > 1 || matches[0].labelIssue !== null ||
      getPortableNameIssue(matches[0].label) !== null) {
    return createFault(
      reference,
      "repository-name-invalid",
      `普通仓库“${reference.repositoryName}”的名称存在冲突或不符合可移植规则。`,
    );
  }
  return matches[0];
}

export function createJournalWorkspaceReferenceResolver(
  catalog: Pick<
    WorkspaceRepositoryCatalog,
    "listRepositories" | "openRepository"
  >,
  {
    workspaceSnapshot = null,
  }: {
    workspaceSnapshot?: JournalWorkspaceReferenceSnapshot | null;
  } = {},
): JournalWorkspaceReferenceResolver {
  return {
    async resolve(references) {
      if (references.length === 0) {
        return [];
      }
      let repositories: readonly WorkspaceRepositoryDescriptor[];

      try {
        repositories = (await catalog.listRepositories()).repositories;
      } catch {
        return references.map((reference) => createFault(
          reference,
          "repository-unreadable",
          `无法读取普通仓库目录，暂时不能解析“${reference.targetText}”。`,
        ));
      }

      const matched = references.map((reference) => ({
        match: matchRepository(repositories, reference),
        reference,
      }));
      const descriptorById = new Map<string, WorkspaceRepositoryDescriptor>();

      for (const { match } of matched) {
        if (!("status" in match)) {
          descriptorById.set(match.id, match);
        }
      }
      const workspaceByRepositoryId = new Map<
        string,
        WorkspaceData | Error
      >();

      await Promise.all([...descriptorById.values()].map(async (descriptor) => {
        if (workspaceSnapshot?.repositoryId === descriptor.id) {
          workspaceByRepositoryId.set(
            descriptor.id,
            workspaceSnapshot.workspace,
          );
          return;
        }
        try {
          workspaceByRepositoryId.set(
            descriptor.id,
            (await catalog.openRepository(descriptor).loadSnapshot())
              .content.workspace,
          );
        } catch (error) {
          workspaceByRepositoryId.set(
            descriptor.id,
            error instanceof Error ? error : new Error("unknown repository error"),
          );
        }
      }));

      return matched.map(({ match, reference }) => {
        if ("status" in match) {
          return match;
        }
        const workspace = workspaceByRepositoryId.get(match.id);

        if (!workspace || workspace instanceof Error) {
          return createFault(
            reference,
            "repository-unreadable",
            `无法读取普通仓库“${reference.repositoryName}”。`,
          );
        }
        const noteKey = createPortableNameKey(reference.noteName);
        const notes = workspace.notes.filter((note) => {
          try {
            const title = readWorkspaceNoteHeader(note).title;

            return getPortableNameIssue(title) === null &&
              createPortableNameKey(title) === noteKey;
          } catch {
            return false;
          }
        });

        if (notes.length === 0) {
          return createFault(
            reference,
            "note-not-found",
            `仓库“${reference.repositoryName}”中找不到笔记“${reference.noteName}”。`,
          );
        }
        if (notes.length > 1) {
          return createFault(
            reference,
            "note-ambiguous",
            `仓库“${reference.repositoryName}”中有 ${notes.length} 篇同名笔记“${reference.noteName}”。`,
          );
        }
        return {
          destination: {
            description: `普通仓库“${reference.repositoryName}”`,
            id: `workspace-note:${match.id}:${notes[0].id}`,
            kind: "workspace-note",
            label: `${reference.repositoryName}:${reference.noteName}`,
            lineNumber: 1,
            noteId: notes[0].id,
            repositoryId: match.id,
          },
          reference,
          status: "resolved",
        };
      });
    },
  };
}

export function findJournalWorkspaceReferenceResolution(
  state: JournalWorkspaceReferenceResolutionState,
  sourceEntryId: string,
  targetText: string,
) {
  return state.status === "ready"
    ? state.resolutions.find(
        ({ reference }) =>
          reference.sourceEntryId === sourceEntryId &&
          reference.targetText === targetText,
      ) ?? null
    : null;
}
