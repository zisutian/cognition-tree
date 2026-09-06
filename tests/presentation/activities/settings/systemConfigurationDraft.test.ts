// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import type {
  SystemConfigurationInput,
  SystemConfigurationSnapshot,
} from "../../../../application/system";
import {
  createSystemConfigurationDraftState,
  projectSystemConfigurationDraftSource,
  reduceSystemConfigurationDraft,
  type SystemConfigurationDraftSubmission,
} from "../../../../presentation/activities/settings/systemConfigurationDraft";

const baseInput: SystemConfigurationInput = {
  listenMode: "loopback",
  maxAuditEntries: 1_000,
  port: 3_001,
  publicOrigin: null,
  repositoryHostRoot: null,
};

function snapshot(
  version: number,
  input: SystemConfigurationInput = baseInput,
): SystemConfigurationSnapshot {
  return {
    configuration: { ...input, dataRoot: "/data/current" },
    effectiveConfiguration: { ...input, dataRoot: "/data/current" },
    ownerCredentialConfigured: false,
    ownerCredentialRotationPending: false,
    restartRequired: false,
    revision: `sha256:${version.toString(16).padStart(64, "0")}`,
    runtimeApplyErrorMessage: null,
    version,
  };
}

function change(
  input: SystemConfigurationInput,
  generation: number,
  state = createSystemConfigurationDraftState(snapshot(1)),
) {
  return reduceSystemConfigurationDraft(state, {
    draft: input,
    generation,
    type: "draft-changed",
  });
}

describe("system configuration draft", () => {
  it("preserves a dirty draft across an envelope-only snapshot update", () => {
    const edited = { ...baseInput, maxAuditEntries: 2_000 };
    const state = reduceSystemConfigurationDraft(change(edited, 1), {
      source: projectSystemConfigurationDraftSource(snapshot(2)),
      type: "source-observed",
    });
    const afterOlderSource = reduceSystemConfigurationDraft(state, {
      source: projectSystemConfigurationDraftSource(
        snapshot(1, {
          ...baseInput,
          port: 9_001,
        }),
      ),
      type: "source-observed",
    });

    expect(state.draft).toEqual(edited);
    expect(state.baseline?.revision).toBe(snapshot(2).revision);
    expect(state.conflict).toBeNull();
    expect(afterOlderSource).toBe(state);
  });

  it("adopts external editable changes only while the draft is clean", () => {
    const external = { ...baseInput, port: 4_001 };
    const clean = reduceSystemConfigurationDraft(
      createSystemConfigurationDraftState(snapshot(1)),
      {
        source: projectSystemConfigurationDraftSource(snapshot(2, external)),
        type: "source-observed",
      },
    );
    const local = { ...external, maxAuditEntries: 2_000 };
    const dirty = change(local, 1, clean);
    const conflicting = { ...external, port: 5_001 };
    const stale = reduceSystemConfigurationDraft(dirty, {
      source: projectSystemConfigurationDraftSource(snapshot(3, conflicting)),
      type: "source-observed",
    });

    expect(clean.draft).toEqual(external);
    expect(stale.draft).toEqual(local);
    expect(stale.baseline?.input).toEqual(external);
    expect(stale.conflict?.input).toEqual(conflicting);
  });

  it("keeps an expired baseline until explicit reload even when input matches saved values", () => {
    const edited = { ...baseInput, maxAuditEntries: 2_000 };
    const external = { ...baseInput, port: 4_001 };
    const remote = projectSystemConfigurationDraftSource(snapshot(2, external));
    let state = reduceSystemConfigurationDraft(change(edited, 1), {
      source: remote,
      type: "source-observed",
    });
    state = change(external, 2, state);
    expect(state.conflict).toEqual(remote);
    state = change(baseInput, 3, state);
    const newest = projectSystemConfigurationDraftSource(snapshot(3, edited));
    state = reduceSystemConfigurationDraft(state, {
      source: newest,
      type: "source-observed",
    });
    expect(state.baseline?.input).toEqual(baseInput);
    expect(state.draft).toEqual(baseInput);
    expect(state.conflict).toEqual(newest);
    state = reduceSystemConfigurationDraft(state, {
      source: newest,
      generation: 4,
      type: "latest-adopted",
    });
    expect(state.conflict).toBeNull();
    expect(state.draft).toEqual(edited);
  });

  it("does not adopt an external update matching a dirty draft", () => {
    const edited = { ...baseInput, port: 4_001 };
    const external = projectSystemConfigurationDraftSource(snapshot(2, edited));
    const state = reduceSystemConfigurationDraft(change(edited, 1), {
      source: external,
      type: "source-observed",
    });
    expect(state.baseline?.input).toEqual(baseInput);
    expect(state.conflict).toEqual(external);
  });

  it("advances the baseline without losing edits made during submission", () => {
    const submittedInput = { ...baseInput, maxAuditEntries: 2_000 };
    const laterInput = { ...submittedInput, repositoryHostRoot: "/host" };
    const submission: SystemConfigurationDraftSubmission = {
      baseRevision: snapshot(1).revision,
      generation: 1,
      id: 7,
      input: submittedInput,
    };
    let state = change(submittedInput, 1);

    state = reduceSystemConfigurationDraft(state, {
      submission,
      type: "submission-started",
    });
    state = change(laterInput, 2, state);
    const saved = projectSystemConfigurationDraftSource(
      snapshot(2, submittedInput),
    )!;

    state = reduceSystemConfigurationDraft(state, {
      source: saved,
      type: "source-observed",
    });
    state = reduceSystemConfigurationDraft(state, {
      source: saved,
      submissionId: submission.id,
      type: "submission-succeeded",
    });

    expect(state.activeSubmission).toBeNull();
    expect(state.baseline).toEqual(saved);
    expect(state.draft).toEqual(laterInput);
  });

  it("keeps failures and old completions from replacing the current draft", () => {
    const submittedInput = { ...baseInput, maxAuditEntries: 2_000 };
    const submission: SystemConfigurationDraftSubmission = {
      baseRevision: snapshot(1).revision,
      generation: 1,
      id: 3,
      input: submittedInput,
    };
    let state = change(submittedInput, 1);

    state = reduceSystemConfigurationDraft(state, {
      submission,
      type: "submission-started",
    });
    const afterOldCompletion = reduceSystemConfigurationDraft(state, {
      source: projectSystemConfigurationDraftSource(
        snapshot(2, submittedInput),
      )!,
      submissionId: 2,
      type: "submission-succeeded",
    });
    const failed = reduceSystemConfigurationDraft(afterOldCompletion, {
      submissionId: submission.id,
      type: "submission-failed",
    });
    const remounted = createSystemConfigurationDraftState(
      snapshot(2, submittedInput),
    );

    expect(afterOldCompletion).toBe(state);
    expect(failed.draft).toEqual(submittedInput);
    expect(failed.activeSubmission).toBeNull();
    expect(remounted.draft).toEqual(submittedInput);
    expect(remounted.baseline?.revision).toBe(snapshot(2).revision);
  });
});
