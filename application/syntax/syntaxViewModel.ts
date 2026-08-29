import type { CtnSyntaxDraft } from "../../core/ctn/syntax/draft";
import type { CtnSyntaxOwner } from "../../core/ctn/syntax/types";
import type { UiWorkbenchDiagnostic } from "../workspace/projection/viewDiagnostics";
import type { createSyntaxDraftActions } from "./syntaxDraftActions";
import type { SyntaxProjection } from "./syntaxProjection";

export type SyntaxSystemOwner = "journal" | "todo";

export type SyntaxTarget =
  | { kind: "journal" }
  | { kind: "todo" }
  | { fileId: string; kind: "workspace-file" };

export type SyntaxSystemConfigurationView = {
  available: boolean;
  hasErrors: boolean;
  isSelected: boolean;
  label: string;
  owner: SyntaxSystemOwner;
};

export type SyntaxFileView = {
  hasErrors: boolean;
  id: string;
  isActive: boolean;
  isSelected: boolean;
  name: string;
};

type SyntaxDraftActionProjection = ReturnType<typeof createSyntaxDraftActions>;

export type SyntaxViewModel = SyntaxProjection &
  Omit<SyntaxDraftActionProjection, "actions"> & {
    actions: SyntaxDraftActionProjection["actions"] | null;
    activeFileId: string | null;
    activateFile: (fileId: string) => Promise<void>;
    createFile: () => Promise<string>;
    deleteFile: (fileId: string) => Promise<void>;
    files: SyntaxFileView[];
    hasDraftErrors: boolean;
    isConfigured: boolean;
    isSelectedAvailable: boolean;
    nameConflictMessage: string;
    onConsumeFocusTarget: (requestId: number) => void;
    owner: CtnSyntaxOwner;
    syntaxDiagnostics: UiWorkbenchDiagnostic[];
    revertInvalidChanges: () => void;
    selectedTarget: SyntaxTarget;
    selectTarget: (target: SyntaxTarget) => Promise<void>;
    systemConfigurations: SyntaxSystemConfigurationView[];
    workspaceAvailable: boolean;
  };

export type AvailableSyntaxViewModel = SyntaxViewModel & {
  actions: SyntaxDraftActionProjection["actions"];
  draft: CtnSyntaxDraft;
  isSelectedAvailable: true;
};

export function isAvailableSyntaxViewModel(
  view: SyntaxViewModel,
): view is AvailableSyntaxViewModel {
  return view.isSelectedAvailable && view.draft !== null &&
    view.actions !== null;
}

export function isSameSyntaxTarget(
  left: SyntaxTarget,
  right: SyntaxTarget,
) {
  return left.kind === right.kind &&
    (left.kind !== "workspace-file" ||
      (right.kind === "workspace-file" && left.fileId === right.fileId));
}

export function createSyntaxFileViews({
  activeFileId,
  files,
  hasDraftErrors,
  selectedFileId,
  selectedTarget,
}: {
  activeFileId: string | null;
  files: Array<{ id: string; name: string }>;
  hasDraftErrors: boolean;
  selectedFileId: string | null;
  selectedTarget: SyntaxTarget;
}): SyntaxFileView[] {
  return files.map((file) => {
    const isSelected = selectedTarget.kind === "workspace-file" &&
      file.id === selectedFileId;

    return {
      ...file,
      hasErrors: isSelected && hasDraftErrors,
      isActive: file.id === activeFileId,
      isSelected,
    };
  });
}
