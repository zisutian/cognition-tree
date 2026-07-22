import type { CtnSyntaxProfileValidationPolicy } from "../../../../../ctn/syntax/profileSchema";
import type { UiSyntaxView } from "../../projection/viewSyntax";
import type { UiWorkbenchDiagnostic } from "../../projection/viewDiagnostics";
import type { createSyntaxDraftActions } from "./syntaxDraftActions";

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

export type SyntaxViewModel = UiSyntaxView &
  ReturnType<typeof createSyntaxDraftActions> & {
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
    policy: CtnSyntaxProfileValidationPolicy;
    profileDiagnostics: UiWorkbenchDiagnostic[];
    revertInvalidChanges: () => void;
    rootRuleLabel: string | null;
    selectedTarget: SyntaxTarget;
    selectTarget: (target: SyntaxTarget) => Promise<void>;
    systemConfigurations: SyntaxSystemConfigurationView[];
    workspaceAvailable: boolean;
  };

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
