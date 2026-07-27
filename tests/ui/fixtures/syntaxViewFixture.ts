import type {
  SyntaxViewModel,
} from "../../../application/syntax/syntaxViewModel";
import { createUiSyntaxView } from "../../../application/workspace/projection/viewSyntax";
import { createCtnSyntaxDraft } from "../../../core/ctn/syntax/draft";
import { defaultCtnSyntax } from "../../../core/ctn/syntax/defaultSyntax";

export function createSyntaxView(
  overrides: Partial<SyntaxViewModel> = {},
): SyntaxViewModel {
  const syntax = createUiSyntaxView({
    draft: createCtnSyntaxDraft(defaultCtnSyntax),
  });

  return {
    ...syntax,
    activeFileId: "syntax-default",
    activateFile: async () => undefined,
    actions: {
      addBlock: () => undefined,
      addInline: () => undefined,
      removeBlock: () => undefined,
      removeInline: () => undefined,
      updateBlock: () => undefined,
      updateInline: () => undefined,
      updateName: () => undefined,
      updateRoot: () => undefined,
      updateTabDisplayWidth: () => undefined,
      updateTitle: () => undefined,
    },
    createFile: async () => "syntax-copy",
    deleteFile: async () => undefined,
    files: [{
      hasErrors: false,
      id: "syntax-default",
      isActive: true,
      isSelected: true,
      name: defaultCtnSyntax.name,
    }],
    hasDraftErrors: false,
    isConfigured: true,
    isSelectedAvailable: true,
    nameEditable: true,
    nameConflictMessage: "",
    onConsumeFocusTarget: () => undefined,
    syntaxDiagnostics: [],
    protectedBlockRuleIds: [],
    protectedInlineRuleIds: [
      syntax.draft.inline.find(
        ({ semanticId }) => semanticId === "global-reference",
      )!.id,
    ],
    protectedInlineTriggerRuleIds: [],
    revertInvalidChanges: () => undefined,
    rootRuleLabel: "顶格概念",
    selectedTarget: {
      fileId: "syntax-default",
      kind: "workspace-file",
    },
    selectTarget: async () => undefined,
    systemConfigurations: [
      {
        available: true,
        hasErrors: false,
        isSelected: false,
        label: "日记",
        owner: "journal",
      },
      {
        available: true,
        hasErrors: false,
        isSelected: false,
        label: "代办",
        owner: "todo",
      },
    ],
    workspaceAvailable: true,
    ...overrides,
  };
}
