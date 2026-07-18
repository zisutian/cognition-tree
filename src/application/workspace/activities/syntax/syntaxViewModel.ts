import type { UiSyntaxView } from "../../projection/viewSyntax";
import type { createSyntaxDraftActions } from "./syntaxDraftActions";

export type SyntaxFileView = {
  hasErrors: boolean;
  id: string;
  isActive: boolean;
  name: string;
};

export type SyntaxViewModel = UiSyntaxView &
  ReturnType<typeof createSyntaxDraftActions> & {
    activeFileId: string | null;
    createFile: () => Promise<void>;
    deleteFile: (fileId: string) => Promise<void>;
    files: SyntaxFileView[];
    hasDraftErrors: boolean;
    isConfigured: boolean;
    nameConflictMessage: string;
    onConsumeFocusTarget: (requestId: number) => void;
    selectFile: (fileId: string) => Promise<void>;
  };

export function createSyntaxFileViews({
  activeFileId,
  files,
  hasDraftErrors,
}: {
  activeFileId: string | null;
  files: Array<{ id: string; name: string }>;
  hasDraftErrors: boolean;
}): SyntaxFileView[] {
  return files.map((file) => ({
    ...file,
    hasErrors: file.id === activeFileId && hasDraftErrors,
    isActive: file.id === activeFileId,
  }));
}
