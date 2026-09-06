// SPDX-License-Identifier: GPL-3.0-or-later

export type {
  AvailableSyntaxViewModel,
  SyntaxFileView,
  SyntaxTarget,
  SyntaxViewModel,
} from "./syntaxViewModel.ts";
export {
  createCtnSyntaxDraftSource,
  isCurrentSyntaxPersistenceCompletion,
  resolveCtnSyntaxDraftAfterSourceChange,
  startCtnSyntaxDraftPersistence,
} from "./syntaxDraftPersistence.ts";
export {
  createSyntaxDraftActions,
} from "./syntaxDraftActions.ts";
export {
  createSyntaxFileViews,
  isAvailableSyntaxViewModel,
  isSameSyntaxTarget,
} from "./syntaxViewModel.ts";
export {
  createSyntaxProjection,
  createSyntaxRuleFieldId,
  syntaxFieldIds,
} from "./syntaxProjection.ts";
export {
  createUiSyntaxDiagnostics,
  createUiSystemSyntaxDiagnostics,
} from "./syntaxDiagnostics.ts";
export type {
  CtnSyntaxDraftRuntimeSource,
} from "./syntaxDraftPersistence.ts";
export type {
  SyntaxDiagnosticTarget,
} from "./syntaxDiagnostics.ts";
export type {
  SyntaxFieldId,
  SyntaxFocusTarget,
  SyntaxTone,
  SyntaxToneOption,
} from "./syntaxProjection.ts";
