import { useMemo } from "react";
import { createUiSyntaxView } from "../../projection/viewSyntax";
import type { SyntaxRuntime } from "../../runtime/useSyntaxRuntime";
import { createSyntaxDraftActions } from "./syntaxDraftActions";
import type { SyntaxViewModel } from "./syntaxViewModel";

export function useSyntaxActivity(
  syntax: SyntaxRuntime,
): SyntaxViewModel {
  const view = useMemo(
    () => createUiSyntaxView({
      draft: syntax.syntaxDraft,
      draftResult: syntax.syntaxDraftResult,
      feedback: syntax.syntaxFeedback,
    }),
    [
      syntax.syntaxDraft,
      syntax.syntaxDraftResult,
      syntax.syntaxFeedback,
    ],
  );
  const draftActions = useMemo(
    () => createSyntaxDraftActions({
      syntaxDraft: syntax.syntaxDraft,
      updateSyntaxDraft: syntax.updateSyntaxDraft,
    }),
    [syntax.syntaxDraft, syntax.updateSyntaxDraft],
  );

  return { ...view, ...draftActions };
}
