import { useMemo } from "react";
import { createUiSyntaxView } from "../../projection/viewSyntax";
import type { SyntaxRuntime } from "../../runtime/useSyntaxRuntime";
import { createSyntaxDraftActions } from "./syntaxDraftActions";
import type { SyntaxViewModel } from "./syntaxViewModel";

export function useSyntaxActivity(
  syntax: SyntaxRuntime,
  focusTarget: SyntaxViewModel["focusTarget"],
): SyntaxViewModel {
  const view = useMemo(
    () => createUiSyntaxView({
      draft: syntax.syntaxDraft,
      focusTarget,
    }),
    [
      focusTarget,
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

  return {
    ...view,
    ...draftActions,
    createConfiguration: syntax.createDefaultSyntax,
    isConfigured: syntax.isConfigured,
  };
}
