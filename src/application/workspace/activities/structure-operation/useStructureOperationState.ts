import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { UiStructureOperationView } from "../../projection/viewStructureOperation";
import type { UiNoteId } from "../../projection/viewTree";
import type { WorkspaceStructureIndex } from "../../../../../core/workspace/indexes/workspaceStructureIndex";
import type { NoteRecord } from "../../../../../core/workspace/model/workspaceData";
import { hasWorkspaceNote } from "../../../../../core/workspace/queries/workspaceQueries";
import { resolveDifferentNoteId } from "../../selection/viewSelection";
import type { StructureOperationPairSelectionPhase } from "./directorySelection";

export type StructureOperationState = {
  mode: UiStructureOperationView["mode"];
  pairSelectionPhase: StructureOperationPairSelectionPhase;
  setMode: Dispatch<SetStateAction<UiStructureOperationView["mode"]>>;
  setPairSelectionPhase: Dispatch<
    SetStateAction<StructureOperationPairSelectionPhase>
  >;
  setSourceNoteId: Dispatch<SetStateAction<UiNoteId>>;
  setStructureNoteId: Dispatch<SetStateAction<UiNoteId>>;
  setTargetNoteId: Dispatch<SetStateAction<UiNoteId>>;
  sourceNoteId: UiNoteId;
  structureNoteId: UiNoteId;
  targetNoteId: UiNoteId;
};

export function useStructureOperationState({
  activeNoteId,
  notes,
  workspace,
}: {
  activeNoteId: UiNoteId | null;
  notes: NoteRecord[];
  workspace: WorkspaceStructureIndex | null;
}): StructureOperationState {
  const [mode, setMode] =
    useState<UiStructureOperationView["mode"]>("betweenNotes");
  const [sourceNoteId, setSourceNoteId] = useState("");
  const [targetNoteId, setTargetNoteId] = useState("");
  const [structureNoteId, setStructureNoteId] = useState("");
  const [pairSelectionPhase, setPairSelectionPhase] =
    useState<StructureOperationPairSelectionPhase>("selectSource");

  useEffect(() => {
    if (
      sourceNoteId &&
      workspace &&
      hasWorkspaceNote(workspace, sourceNoteId)
    ) {
      return;
    }

    if (activeNoteId && workspace && hasWorkspaceNote(workspace, activeNoteId)) {
      setSourceNoteId(activeNoteId);
      return;
    }

    setSourceNoteId(notes[0]?.id ?? "");
  }, [activeNoteId, notes, sourceNoteId, workspace]);

  useEffect(() => {
    if (
      targetNoteId &&
      targetNoteId !== sourceNoteId &&
      workspace &&
      hasWorkspaceNote(workspace, targetNoteId)
    ) {
      return;
    }

    setTargetNoteId(resolveDifferentNoteId(notes, sourceNoteId));
  }, [notes, sourceNoteId, targetNoteId, workspace]);

  useEffect(() => {
    if (
      structureNoteId &&
      workspace &&
      hasWorkspaceNote(workspace, structureNoteId)
    ) {
      return;
    }

    if (activeNoteId && workspace && hasWorkspaceNote(workspace, activeNoteId)) {
      setStructureNoteId(activeNoteId);
      return;
    }

    setStructureNoteId(notes[0]?.id ?? "");
  }, [activeNoteId, notes, structureNoteId, workspace]);

  return {
    mode,
    pairSelectionPhase,
    setMode,
    setPairSelectionPhase,
    setSourceNoteId,
    setStructureNoteId,
    setTargetNoteId,
    sourceNoteId,
    structureNoteId,
    targetNoteId,
  };
}
