import { useEffect, useMemo } from "react";
import { createUiSyntaxView } from "../../projection/viewSyntax";
import type { SyntaxRuntime } from "../../runtime/useSyntaxRuntime";
import { createSyntaxDraftActions } from "./syntaxDraftActions";
import {
  createSyntaxFileViews,
  type SyntaxViewModel,
} from "./syntaxViewModel";

export function projectSyntaxFocusTargetForActiveFile(
  focusTarget: SyntaxViewModel["focusTarget"],
  activeFileId: string | null,
) {
  return focusTarget?.syntaxFileId === activeFileId ? focusTarget : null;
}

export function getSyntaxFocusFileIdToActivate(
  focusTarget: SyntaxViewModel["focusTarget"],
  activeFileId: string | null,
) {
  return focusTarget && focusTarget.syntaxFileId !== activeFileId
    ? focusTarget.syntaxFileId
    : null;
}

export function useSyntaxActivity(
  syntax: SyntaxRuntime,
  focusTarget: SyntaxViewModel["focusTarget"],
  onConsumeFocusTarget: SyntaxViewModel["onConsumeFocusTarget"],
): SyntaxViewModel {
  const focusTargetForActiveFile = projectSyntaxFocusTargetForActiveFile(
    focusTarget,
    syntax.activeFileId,
  );
  const view = useMemo(
    () => createUiSyntaxView({
      draft: syntax.syntaxDraft,
      focusTarget: focusTargetForActiveFile,
    }),
    [
      focusTargetForActiveFile,
      syntax.syntaxDraft,
    ],
  );
  const draftActions = useMemo(
    () => createSyntaxDraftActions({
      syntaxDraft: syntax.syntaxDraft,
      updateSyntaxDraft: syntax.updateSyntaxDraft,
    }),
    [syntax.syntaxDraft, syntax.updateSyntaxDraft],
  );
  const hasDraftErrors = syntax.syntaxDraftResult.diagnostics.length > 0 ||
    Boolean(syntax.catalogNameConflictMessage);
  const files = useMemo(
    () => createSyntaxFileViews({
      activeFileId: syntax.activeFileId,
      files: syntax.files,
      hasDraftErrors,
    }),
    [syntax.activeFileId, syntax.files, hasDraftErrors],
  );

  useEffect(() => {
    const fileId = getSyntaxFocusFileIdToActivate(
      focusTarget,
      syntax.activeFileId,
    );

    if (!fileId) {
      return;
    }

    void syntax.selectSyntaxFile(fileId).catch(
      () => undefined,
    );
  }, [focusTarget, syntax.activeFileId, syntax.selectSyntaxFile]);

  return {
    ...view,
    ...draftActions,
    activeFileId: syntax.activeFileId,
    createFile: syntax.createSyntaxFile,
    deleteFile: syntax.deleteSyntaxFile,
    files,
    hasDraftErrors,
    isConfigured: syntax.isConfigured,
    nameConflictMessage: syntax.catalogNameConflictMessage,
    onConsumeFocusTarget,
    selectFile: syntax.selectSyntaxFile,
  };
}
