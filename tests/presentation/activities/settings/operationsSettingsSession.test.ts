// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import type {
  OperationAuditEntry,
} from "../../../../application/operations/operationAdministration";
import {
  createInitialOperationsSettingsSnapshot,
  reduceOperationsSettings,
} from "../../../../presentation/activities/settings/operationsSettingsSession";

const revision = `sha256:${"1".repeat(64)}` as const;

function entry(id: string): OperationAuditEntry {
  return {
    afterRevision: revision,
    beforeRevision: revision,
    blockIds: [],
    id,
    occurredAt: "2026-08-30T00:00:00.000Z",
    principalId: "owner",
    requestId: `request-${id}`,
    resourceIds: [],
    result: "committed",
    route: "/api/v4/content/workspace",
    source: "trusted-client",
    store: { domain: "journal" },
    technical: { intentDigest: null },
    updatedAt: "2026-08-30T00:00:00.000Z",
  };
}

describe("operations settings session state", () => {
  it("normalizes selection inside the owner whenever entries change", () => {
    const first = entry("first");
    const second = entry("second");
    const third = entry("third");
    let state = reduceOperationsSettings(
      createInitialOperationsSettingsSnapshot(),
      { status: { status: "available" }, type: "status-loaded" },
    );

    state = reduceOperationsSettings(state, {
      entries: [first, second],
      type: "loaded",
    });
    expect(state.selectedEntryId).toBe(first.id);
    state = reduceOperationsSettings(state, {
      entryId: second.id,
      type: "selected",
    });
    state = reduceOperationsSettings(state, {
      entries: [second, third],
      type: "loaded",
    });
    expect(state.selectedEntryId).toBe(second.id);
    state = reduceOperationsSettings(state, {
      entries: [third],
      type: "loaded",
    });
    expect(state.selectedEntryId).toBe(third.id);
  });

  it("clears entries and selection when audit becomes unavailable", () => {
    const loaded = reduceOperationsSettings(
      createInitialOperationsSettingsSnapshot(),
      { entries: [entry("first")], type: "loaded" },
    );
    const unavailable = reduceOperationsSettings(loaded, {
      status: { message: "ledger offline", status: "unavailable" },
      type: "status-loaded",
    });

    expect(unavailable).toMatchObject({
      entries: [],
      loading: false,
      selectedEntryId: null,
      status: { message: "ledger offline", status: "unavailable" },
    });
  });

  it("keeps the last coherent result when a refresh fails", () => {
    const item = entry("first");
    let state = reduceOperationsSettings(
      createInitialOperationsSettingsSnapshot(),
      { status: { status: "available" }, type: "status-loaded" },
    );

    state = reduceOperationsSettings(state, {
      entries: [item],
      type: "loaded",
    });
    state = reduceOperationsSettings(state, { type: "load-started" });
    state = reduceOperationsSettings(state, {
      errorMessage: "network unavailable",
      type: "load-failed",
    });

    expect(state).toMatchObject({
      entries: [item],
      errorMessage: "network unavailable",
      loading: false,
      selectedEntryId: item.id,
      status: { status: "available" },
    });
  });
});
