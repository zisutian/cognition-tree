// SPDX-License-Identifier: GPL-3.0-or-later

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import type {
  SystemConfigurationController,
  SystemConfigurationInput,
  SystemConfigurationSnapshot,
} from "../../../application/system/index.ts";
import {
  createSystemConfigurationDraftState,
  projectSystemConfigurationDraftSource,
  reduceSystemConfigurationDraft,
  systemConfigurationInputsEqual,
  type SystemConfigurationDraftSubmission,
} from "./systemConfigurationDraft.ts";

type SystemConfigurationDraftSubmitResult = Readonly<{
  restartConfiguration: SystemConfigurationInput | null;
}>;

type SystemConfigurationDraftView = Readonly<{
  change(draft: SystemConfigurationInput): void;
  discardChanges(): void;
  draft: SystemConfigurationInput | null;
  stale: boolean;
  submit(): Promise<SystemConfigurationDraftSubmitResult>;
  submitting: boolean;
}>;

type SystemConfigurationDraftController = Pick<
  SystemConfigurationController,
  "update"
>;

function submitResult(
  restartConfiguration: SystemConfigurationInput | null = null,
): SystemConfigurationDraftSubmitResult {
  return { restartConfiguration };
}

export function useSystemConfigurationDraft({
  configuration,
  controller,
}: {
  configuration: SystemConfigurationSnapshot | null;
  controller: SystemConfigurationDraftController;
}): SystemConfigurationDraftView {
  const source = useMemo(
    () => projectSystemConfigurationDraftSource(configuration),
    [configuration],
  );
  const [state, dispatch] = useReducer(
    reduceSystemConfigurationDraft,
    configuration,
    createSystemConfigurationDraftState,
  );
  const activeSubmissionRef = useRef<SystemConfigurationDraftSubmission | null>(
    null,
  );
  const draftGenerationRef = useRef(0);
  const nextSubmissionIdRef = useRef(1);
  const lifecycleEpochRef = useRef(0);
  const latestSourceRef = useRef(source);
  const latestSource =
    source &&
    (!latestSourceRef.current ||
      source.version >= latestSourceRef.current.version)
      ? source
      : latestSourceRef.current;

  useEffect(() => {
    dispatch({ source, type: "source-observed" });
  }, [source]);

  useLayoutEffect(() => {
    latestSourceRef.current = latestSource;
  }, [latestSource]);

  useLayoutEffect(() => () => {
    lifecycleEpochRef.current += 1;
    activeSubmissionRef.current = null;
  }, []);

  const change = useCallback((draft: SystemConfigurationInput) => {
    const generation = draftGenerationRef.current + 1;

    draftGenerationRef.current = generation;
    dispatch({ draft, generation, type: "draft-changed" });
  }, []);
  const discardChanges = useCallback(() => {
    if (!latestSource || activeSubmissionRef.current) return;
    const generation = draftGenerationRef.current + 1;

    draftGenerationRef.current = generation;
    dispatch({ generation, source: latestSource, type: "latest-adopted" });
  }, [latestSource]);
  const submit = useCallback(async () => {
    if (activeSubmissionRef.current || state.activeSubmission) {
      return submitResult();
    }
    if (!state.baseline || !state.draft || !latestSource) {
      return submitResult();
    }
    const sourceMatchesBaseline = systemConfigurationInputsEqual(
      latestSource.input,
      state.baseline.input,
    );
    const sourceMatchesDraft = systemConfigurationInputsEqual(
      latestSource.input,
      state.draft,
    );

    if (!sourceMatchesBaseline && !sourceMatchesDraft) {
      dispatch({ source: latestSource, type: "source-observed" });
      return submitResult();
    }
    const submission: SystemConfigurationDraftSubmission = {
      baseRevision: latestSource.revision,
      generation: draftGenerationRef.current,
      id: nextSubmissionIdRef.current,
      input: { ...state.draft },
    };

    nextSubmissionIdRef.current += 1;
    activeSubmissionRef.current = submission;
    dispatch({ submission, type: "submission-started" });
    const lifecycleEpoch = lifecycleEpochRef.current;

    try {
      const updated = await controller.update({
        baseRevision: submission.baseRevision,
        configuration: submission.input,
      });

      if (
        lifecycleEpochRef.current !== lifecycleEpoch ||
        activeSubmissionRef.current?.id !== submission.id
      ) {
        return submitResult();
      }
      const editedAfterSubmission =
        draftGenerationRef.current !== submission.generation;
      const updatedSource = projectSystemConfigurationDraftSource(updated);
      const superseded = (latestSourceRef.current?.version ?? -1) >
        updated.version;

      activeSubmissionRef.current = null;
      dispatch({
        source: updatedSource,
        submissionId: submission.id,
        type: "submission-succeeded",
      });
      return submitResult(
        updated.restartRequired && !editedAfterSubmission && !superseded
          ? updatedSource.input
          : null,
      );
    } catch (error) {
      if (
        lifecycleEpochRef.current === lifecycleEpoch &&
        activeSubmissionRef.current?.id === submission.id
      ) {
        activeSubmissionRef.current = null;
        dispatch({
          submissionId: submission.id,
          type: "submission-failed",
        });
      }
      throw error;
    }
  }, [controller, latestSource, state]);

  return {
    change,
    discardChanges,
    draft: state.draft,
    stale: state.conflict !== null,
    submit,
    submitting: state.activeSubmission !== null,
  };
}
