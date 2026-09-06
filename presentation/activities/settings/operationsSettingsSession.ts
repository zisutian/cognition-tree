// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  OperationAuditEntry,
  OperationAuditStatus,
} from "../../../application/operations/index.ts";

export type OperationsSettingsSnapshot = Readonly<{
  entries: readonly OperationAuditEntry[];
  errorMessage: string | null;
  loading: boolean;
  selectedEntryId: string | null;
  status: OperationAuditStatus | null;
}>;

export type OperationsSettingsAction =
  | Readonly<{ type: "load-failed"; errorMessage: string }>
  | Readonly<{ type: "load-started" }>
  | Readonly<{ type: "loaded"; entries: readonly OperationAuditEntry[] }>
  | Readonly<{ type: "reset" }>
  | Readonly<{ type: "selected"; entryId: string }>
  | Readonly<{ type: "status-loaded"; status: OperationAuditStatus }>;

export function createInitialOperationsSettingsSnapshot(): OperationsSettingsSnapshot {
  return {
    entries: [],
    errorMessage: null,
    loading: true,
    selectedEntryId: null,
    status: null,
  };
}

function normalizeSelectedEntryId(
  entries: readonly OperationAuditEntry[],
  selectedEntryId: string | null,
) {
  return selectedEntryId && entries.some(({ id }) => id === selectedEntryId)
    ? selectedEntryId
    : entries[0]?.id ?? null;
}

export function reduceOperationsSettings(
  state: OperationsSettingsSnapshot,
  action: OperationsSettingsAction,
): OperationsSettingsSnapshot {
  switch (action.type) {
    case "load-started":
      return { ...state, errorMessage: null, loading: true };
    case "status-loaded":
      return action.status.status === "unavailable"
        ? {
            ...state,
            entries: [],
            loading: false,
            selectedEntryId: null,
            status: action.status,
          }
        : { ...state, status: action.status };
    case "loaded":
      return {
        ...state,
        entries: action.entries,
        loading: false,
        selectedEntryId: normalizeSelectedEntryId(
          action.entries,
          state.selectedEntryId,
        ),
      };
    case "load-failed":
      return { ...state, errorMessage: action.errorMessage, loading: false };
    case "selected": {
      const selectedEntryId = normalizeSelectedEntryId(
        state.entries,
        action.entryId,
      );

      return selectedEntryId === state.selectedEntryId
        ? state
        : { ...state, selectedEntryId };
    }
    case "reset":
      return createInitialOperationsSettingsSnapshot();
  }
}
