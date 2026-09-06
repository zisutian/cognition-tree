// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  SystemConfigurationInput,
  SystemConfigurationSnapshot,
} from "../../../application/system/index.ts";

export type SystemConfigurationDraftSource = Readonly<{
  input: SystemConfigurationInput;
  revision: SystemConfigurationSnapshot["revision"];
  version: number;
}>;

export type SystemConfigurationDraftSubmission = Readonly<{
  baseRevision: SystemConfigurationSnapshot["revision"];
  generation: number;
  id: number;
  input: SystemConfigurationInput;
}>;

export type SystemConfigurationDraftState = Readonly<{
  activeSubmission: SystemConfigurationDraftSubmission | null;
  baseline: SystemConfigurationDraftSource | null;
  conflict: SystemConfigurationDraftSource | null;
  draft: SystemConfigurationInput | null;
  generation: number;
}>;

export type SystemConfigurationDraftAction =
  | Readonly<{
      source: SystemConfigurationDraftSource | null;
      type: "source-observed";
    }>
  | Readonly<{
      draft: SystemConfigurationInput;
      generation: number;
      type: "draft-changed";
    }>
  | Readonly<{
      submission: SystemConfigurationDraftSubmission;
      type: "submission-started";
    }>
  | Readonly<{
      source: SystemConfigurationDraftSource;
      submissionId: number;
      type: "submission-succeeded";
    }>
  | Readonly<{
      submissionId: number;
      type: "submission-failed";
    }>
  | Readonly<{
      generation: number;
      source: SystemConfigurationDraftSource;
      type: "latest-adopted";
    }>;

function inputFromSnapshot(
  snapshot: SystemConfigurationSnapshot,
): SystemConfigurationInput {
  return {
    listenMode: snapshot.configuration.listenMode,
    maxAuditEntries: snapshot.configuration.maxAuditEntries,
    port: snapshot.configuration.port,
    publicOrigin: snapshot.configuration.publicOrigin,
    repositoryHostRoot: snapshot.configuration.repositoryHostRoot,
  };
}

export function projectSystemConfigurationDraftSource(
  snapshot: SystemConfigurationSnapshot,
): SystemConfigurationDraftSource;
export function projectSystemConfigurationDraftSource(
  snapshot: null,
): null;
export function projectSystemConfigurationDraftSource(
  snapshot: SystemConfigurationSnapshot | null,
): SystemConfigurationDraftSource | null;
export function projectSystemConfigurationDraftSource(
  snapshot: SystemConfigurationSnapshot | null,
): SystemConfigurationDraftSource | null {
  return snapshot
    ? {
        input: inputFromSnapshot(snapshot),
        revision: snapshot.revision,
        version: snapshot.version,
      }
    : null;
}

export function systemConfigurationInputsEqual(
  left: SystemConfigurationInput,
  right: SystemConfigurationInput,
) {
  return left.listenMode === right.listenMode &&
    Object.is(left.maxAuditEntries, right.maxAuditEntries) &&
    Object.is(left.port, right.port) &&
    left.publicOrigin === right.publicOrigin &&
    left.repositoryHostRoot === right.repositoryHostRoot;
}

export function createSystemConfigurationDraftState(
  snapshot: SystemConfigurationSnapshot | null,
): SystemConfigurationDraftState {
  const source = projectSystemConfigurationDraftSource(snapshot);

  return {
    activeSubmission: null,
    baseline: source,
    conflict: null,
    draft: source?.input ?? null,
    generation: 0,
  };
}

function observedVersion(state: SystemConfigurationDraftState) {
  return Math.max(
    state.baseline?.version ?? -1,
    state.conflict?.version ?? -1,
  );
}

export function reduceSystemConfigurationDraft(
  state: SystemConfigurationDraftState,
  action: SystemConfigurationDraftAction,
): SystemConfigurationDraftState {
  if (action.type === "draft-changed") {
    if (!state.baseline || !state.draft) return state;
    if (
      state.conflict &&
      systemConfigurationInputsEqual(action.draft, state.conflict.input)
    ) {
      return {
        ...state,
        baseline: state.conflict,
        conflict: null,
        draft: action.draft,
        generation: action.generation,
      };
    }
    return {
      ...state,
      draft: action.draft,
      generation: action.generation,
    };
  }
  if (action.type === "submission-started") {
    if (state.activeSubmission) return state;
    return { ...state, activeSubmission: action.submission };
  }
  if (action.type === "submission-failed") {
    return state.activeSubmission?.id === action.submissionId
      ? { ...state, activeSubmission: null }
      : state;
  }
  if (action.type === "submission-succeeded") {
    const submission = state.activeSubmission;

    if (!submission || submission.id !== action.submissionId) return state;
    if (observedVersion(state) > action.source.version) {
      return { ...state, activeSubmission: null };
    }
    const editedAfterSubmission = state.generation !== submission.generation;

    return {
      ...state,
      activeSubmission: null,
      baseline: action.source,
      conflict: null,
      draft: editedAfterSubmission ? state.draft : action.source.input,
    };
  }
  if (action.type === "latest-adopted") {
    if (state.activeSubmission) return state;
    if (action.source.version < observedVersion(state)) return state;
    return {
      activeSubmission: null,
      baseline: action.source,
      conflict: null,
      draft: action.source.input,
      generation: action.generation,
    };
  }
  const source = action.source;

  if (!source) return state;
  if (source.version < observedVersion(state)) return state;
  if (!state.baseline || !state.draft) {
    return {
      ...state,
      baseline: source,
      conflict: null,
      draft: source.input,
    };
  }
  if (source.revision === state.baseline.revision) return state;
  const submission = state.activeSubmission;

  if (
    submission &&
    systemConfigurationInputsEqual(source.input, submission.input)
  ) {
    const editedAfterSubmission = state.generation !== submission.generation;

    return {
      ...state,
      baseline: source,
      conflict: null,
      draft: editedAfterSubmission ? state.draft : source.input,
    };
  }
  if (systemConfigurationInputsEqual(source.input, state.baseline.input)) {
    return { ...state, baseline: source, conflict: null };
  }
  if (
    systemConfigurationInputsEqual(source.input, state.draft) ||
    systemConfigurationInputsEqual(state.draft, state.baseline.input)
  ) {
    return {
      ...state,
      baseline: source,
      conflict: null,
      draft: source.input,
    };
  }
  return { ...state, conflict: source };
}
