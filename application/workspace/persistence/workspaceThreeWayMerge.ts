// SPDX-License-Identifier: GPL-3.0-or-later

import { equalCtnSourceExceptModificationTime, mergeCtnSourceModificationTimes } from "../../../core/ctn/index.ts";
import type { CtnCanonicalSourceAnalysis } from "../../../core/ctn/index.ts";
import type {
  WorkspaceSyntax,
  NoteId,
} from "../../../core/workspace/index.ts";
import {
  createThreeWayContentMergeResult,
  crossesSyntaxMergeBarrier,
  mergeThreeWayMapValues,
  mergeThreeWayValue,
  reusePreparedMergeContent,
  type ThreeWayContentMergeResult,
} from "../../persistence/index.ts";
import type {
  PreparedVersionedContent,
  VersionedContentConflictPreference,
  VersionedContentMergePolicy,
} from "../../persistence/index.ts";
import type {
  WorkspaceRepositoryContent,
  WorkspaceRepositoryPreparation,
} from "./workspaceRepository.ts";
import { prepareWorkspaceRepositoryContent } from "./workspaceRepositoryPreparation.ts";

function collectWorkspacePreparationOverrides(
  content: WorkspaceRepositoryContent,
  candidates: readonly PreparedVersionedContent<
    WorkspaceRepositoryContent,
    WorkspaceRepositoryPreparation
  >[],
) {
  const analysisOverrides = new Map<NoteId, CtnCanonicalSourceAnalysis>();
  const syntaxOverrides = new Map<string, WorkspaceSyntax>();

  for (const note of content.workspace.notes) {
    for (const candidate of candidates) {
      const parsed = candidate.projection.analysisIndex?.getParsedNote(note.id);

      if (parsed?.source === note.source) {
        analysisOverrides.set(note.id, parsed.analysis);
        break;
      }
    }
  }
  for (const file of content.syntax.files) {
    for (const candidate of candidates) {
      const syntax = candidate.projection.syntaxById.get(file.id);

      if (syntax?.source === file.source) {
        syntaxOverrides.set(file.id, syntax);
        break;
      }
    }
  }
  return { analysisOverrides, syntaxOverrides };
}

function mergeWorkspaceContentValues(
  base: WorkspaceRepositoryContent,
  local: WorkspaceRepositoryContent,
  remote: WorkspaceRepositoryContent,
  conflictPreference: VersionedContentConflictPreference | undefined,
  candidates: readonly PreparedVersionedContent<WorkspaceRepositoryContent, WorkspaceRepositoryPreparation>[],
): ThreeWayContentMergeResult<WorkspaceRepositoryContent> {
  const conflicts: string[] = [];

  if (crossesSyntaxMergeBarrier({
    baseContent: base.workspace,
    baseSyntax: base.syntax,
    localContent: local.workspace,
    localSyntax: local.syntax,
    remoteContent: remote.workspace,
    remoteSyntax: remote.syntax,
  })) {
    return conflictPreference
      ? {
          content: conflictPreference === "local" ? local : remote,
          status: "merged",
        }
      : { status: "conflict", unitIds: ["syntax"] };
  }
  const syntax = mergeThreeWayValue(
    "syntax",
    base.syntax,
    local.syntax,
    remote.syntax,
    conflictPreference,
  );

  if (syntax.conflict) conflicts.push(syntax.conflict);
  const name = mergeThreeWayValue(
    "workspace:name",
    base.workspace.name,
    local.workspace.name,
    remote.workspace.name,
    conflictPreference,
  );
  const tree = mergeThreeWayValue(
    "workspace:tree",
    base.workspace.tree,
    local.workspace.tree,
    remote.workspace.tree,
    conflictPreference,
  );

  if (name.conflict) conflicts.push(name.conflict);
  if (tree.conflict) conflicts.push(tree.conflict);
  if (
    base.workspace.id !== local.workspace.id ||
    base.workspace.id !== remote.workspace.id
  ) {
    conflicts.push("workspace:identity");
  }
  const analysisFor = (note: WorkspaceRepositoryContent["workspace"]["notes"][number]) => candidates
    .map(candidate => candidate.projection.analysisIndex?.getParsedNote(note.id))
    .find(parsed => parsed?.source === note.source)?.analysis;
  const notes = mergeThreeWayMapValues(
    "workspace:note",
    new Map(base.workspace.notes.map((note) => [note.id, note])),
    new Map(local.workspace.notes.map((note) => [note.id, note])),
    new Map(remote.workspace.notes.map((note) => [note.id, note])),
    conflictPreference,
    (left, right) => {
      if (left.id !== right.id) return false;
      if (left.source === right.source) return true;
      const a = analysisFor(left), b = analysisFor(right);
      return !!a && !!b && equalCtnSourceExceptModificationTime(a, b);
    },
  );

  conflicts.push(...notes.conflicts);
  return createThreeWayContentMergeResult({
    schemaVersion: 4,
    syntax: syntax.value,
    workspace: {
      id: base.workspace.id,
      name: name.value,
      notes: [...notes.values.values()].map(note => {
        const selected = analysisFor(note);
        if (!selected) return note;
        const observations = candidates.flatMap(candidate => {
          const parsed = candidate.projection.analysisIndex?.getParsedNote(note.id);
          return parsed ? [parsed.analysis] : [];
        });
        const source = mergeCtnSourceModificationTimes(selected, observations);
        return source === note.source ? note : { ...note, source };
      }),
      tree: tree.value,
    },
  }, conflicts);
}

export const mergeWorkspaceContent: VersionedContentMergePolicy<
  WorkspaceRepositoryContent,
  WorkspaceRepositoryPreparation
> = (base, local, remote, conflictPreference) => {
  const merged = mergeWorkspaceContentValues(
    base.content,
    local.content,
    remote.content,
    conflictPreference,
    [base, local, remote],
  );

  if (merged.status === "conflict") return merged;
  const candidates = [local, remote, base];
  const reused = reusePreparedMergeContent(merged.content, candidates);

  if (reused) return { ...reused, status: "merged" as const };
  const overrides = collectWorkspacePreparationOverrides(
    merged.content,
    candidates,
  );

  return {
    content: merged.content,
    projection: prepareWorkspaceRepositoryContent(merged.content, {
      ...overrides,
      previous: local.projection,
    }),
    status: "merged" as const,
  };
};
