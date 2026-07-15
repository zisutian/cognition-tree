import type { UiSyntaxView } from "../../projection/viewSyntax";
import type { createSyntaxDraftActions } from "./syntaxDraftActions";

export type SyntaxViewModel = UiSyntaxView &
  ReturnType<typeof createSyntaxDraftActions> & {
    createConfiguration: () => Promise<void>;
    isConfigured: boolean;
  };
