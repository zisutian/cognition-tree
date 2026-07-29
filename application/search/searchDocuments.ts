import type {
  CtnCanonicalSourceAnalysis,
} from "../../core/ctn/analysis/sourceAnalysis";
import {
  getCtnEditableLineNumber,
} from "../../core/ctn/metadata/editableSource";
import type { CtnCanonicalBlock } from "../../core/ctn/parser/types";
import type {
  SearchDocument,
  SearchDocumentBlock,
  SearchDomain,
  SearchResourceVersion,
} from "./searchQuery";

function projectBlockBody(
  analysis: CtnCanonicalSourceAnalysis,
  block: CtnCanonicalBlock,
) {
  const range = block.multilineRange;

  if (!range) return null;
  const editable = analysis.editableProjection;
  const start = getCtnEditableLineNumber(
    editable,
    range.contentStartLineNumber,
  );
  const end = getCtnEditableLineNumber(
    editable,
    range.contentEndLineNumber,
  );

  if (end < start) return "";
  return editable.sourceText.lines
    .slice(start - 1, end)
    .map(({ text }) => text)
    .join("\n");
}

function projectBlocks({
  analysis,
  textMode,
}: {
  analysis: CtnCanonicalSourceAnalysis;
  textMode: "body" | "document";
}): SearchDocumentBlock[] {
  return analysis.document.blocks
    .filter((block) =>
      textMode === "document" ||
      block.rule.semanticId !== analysis.syntax.title.semanticId
    )
    .map((block) => ({
      blockId: block.id,
      body: projectBlockBody(analysis, block),
      text: block.text,
      updatedAt: block.metadata.updatedAt,
    }));
}

export function createCtnSearchDocument({
  analysis,
  domain,
  editableText,
  repositoryId,
  resourceId,
  textMode,
  title,
  updatedAt,
  version,
}: {
  analysis: CtnCanonicalSourceAnalysis;
  domain: SearchDomain;
  editableText: string;
  repositoryId?: string;
  resourceId: string;
  textMode: "body" | "document";
  title: string;
  updatedAt: string;
  version: SearchResourceVersion;
}): SearchDocument {
  return {
    blocks: projectBlocks({ analysis, textMode }),
    domain,
    editableText,
    ...(repositoryId ? { repositoryId } : {}),
    resourceId,
    title,
    updatedAt,
    version,
  };
}

export function findSearchBlockLineNumber(
  analysis: CtnCanonicalSourceAnalysis,
  blockId: string,
  textMode: "body" | "document",
) {
  const block = analysis.document.blocks.find(({ id }) => id === blockId);

  if (!block) return null;
  const editableLine = getCtnEditableLineNumber(
    analysis.editableProjection,
    block.lineNumber,
  );

  return Math.max(1, editableLine - (textMode === "body" ? 1 : 0));
}
