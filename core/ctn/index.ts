// SPDX-License-Identifier: GPL-3.0-or-later



export {
  analyzeCtnSource,
  reprojectCtnAnalysisPresentation,
} from "./analysis/sourceAnalysis.ts";
export {
  assertCtnEditableSourceChange,
} from "./metadata/textEdits.ts";
export {
  buildCtnSyntaxDraft,
  createCtnSyntaxDraft,
  createNextCtnSyntaxBlockDraft,
  createNextCtnSyntaxInlineDraft,
  isProtectedCtnSyntaxInlineDraft,
} from "./syntax/draft.ts";
export {
  collectCtnInlineReferences,
  ctnGlobalReferenceType,
  ctnLocalReferenceType,
  normalizeCtnReferenceText,
} from "./parser/inlineReferences.ts";
export {
  compileCtnSyntaxDefinition,
  compileCtnSyntaxSource,
  requireCtnSyntax,
} from "./syntax/compiler.ts";
export {
  createCtnBlockIdAllocator,
} from "./metadata/blockIdAllocator.ts";
export {
  createCtnBlockIdRegistry,
  updateCtnBlockIdRegistry,
} from "./analysis/blockIdRegistry.ts";
export {
  createMyersLineDiff,
  createMyersTextEdits,
} from "./metadata/myersTextEdits.ts";
export type {
  CtnBlockIdRegistry,
  CtnBlockIdRegistryChange,
} from "./analysis/blockIdRegistry.ts";
export type {
  CtnBlockKind,
  CtnCompiledSyntax,
  CtnSyntaxDefinition,
  CtnSyntaxOwner,
  CtnSyntaxTone,
} from "./syntax/types.ts";
export type {
  CtnBlockMetadata,
} from "./metadata/blockMetadata.ts";
export {
  CtnBlockMetadataSyntaxError,
  formatCtnBlockMetadataLine,
  isCtnBlockId,
  isCtnBlockTimestamp,
  removeCtnBlockMetadataLines,
} from "./metadata/blockMetadata.ts";
export type {
  CtnBlockTextTargetPosition,
} from "./parser/blockTextEdit.ts";
export type {
  CtnCanonicalBlock,
  CtnCanonicalDocument,
  CtnEditableBlock,
  CtnEditableDocument,
  CtnInlineSpan,
} from "./parser/types.ts";
export type {
  CtnCanonicalSourceAnalysis,
  CtnEditableSourceAnalysis,
} from "./analysis/sourceAnalysis.ts";
export {
  CtnDocumentMetadataError,
  readCtnCanonicalTitleHeader,
} from "./parser/parseCtnDocument.ts";
export type {
  CtnEditableSource,
} from "./metadata/editableSource.ts";
export type {
  CtnEditableSourceChange,
  CtnTextEdit,
} from "./metadata/textEdits.ts";
export type {
  CtnSyntaxDraft,
  CtnSyntaxDraftBlock,
  CtnSyntaxDraftBuildResult,
  CtnSyntaxDraftDisplayRule,
  CtnSyntaxDraftInline,
} from "./syntax/draft.ts";
export {
  ctnSyntaxSchema,
  normalizeCtnSyntaxTabDisplayWidthInput,
} from "./syntax/schema.ts";
export {
  defaultCtnSyntax,
  defaultCtnSyntaxSource,
} from "./syntax/defaultSyntax.ts";
export {
  findCtnEditableBlockLineNumber,
  projectCtnCanonicalBlockBody,
  projectCtnEditableText,
  projectRawCanonicalCtnBody,
} from "./analysis/editableProjection.ts";
export {
  formatCtnSyntaxV2,
} from "./syntax/formatter.ts";
export {
  getCtnEditableLineNumber,
} from "./metadata/editableSource.ts";
export {
  initializeCtnRawSourceBlockMetadataAnalysis,
  initializeCtnSourceBlockMetadata,
  initializeCtnSourceBlockMetadataAnalysis,
  replaceCtnSourceTitle,
  touchCtnSourceBlockMetadata,
  touchCtnSourceTitleMetadata,
} from "./metadata/sourceMetadata.ts";
export {
  isCustomSyntaxTone,
} from "./syntax/tones.ts";
export {
  moveCtnBlockText,
  moveCtnBlockWithinText,
} from "./parser/blockTextEdit.ts";
export {
  recanonicalizeCtnSourceBlockMetadata,
  reconcileCtnSourceBlockMetadata,
} from "./metadata/reconcileSourceMetadata.ts";
export { equalCtnSourceExceptModificationTime, mergeCtnSourceModificationTimes } from "./metadata/sourceMergeMetadata.ts";
