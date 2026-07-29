import type {
  CtnCanonicalSourceAnalysis,
} from "../../core/ctn/analysis/sourceAnalysis.ts";
import {
  projectCtnCanonicalBlockBody,
} from "../../core/ctn/analysis/editableProjection.ts";
import type {
  SearchDocument,
  SearchDocumentBlock,
  SearchResourceVersion,
} from "./searchQuery.ts";

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
      body: projectCtnCanonicalBlockBody(analysis, block),
      text: block.text,
      updatedAt: block.metadata.updatedAt,
    }));
}

type CtnSearchDocumentInput = {
  analysis: CtnCanonicalSourceAnalysis;
  editableText: string;
  resourceId: string;
  textMode: "body" | "document";
  title: string;
  updatedAt: string;
  version: SearchResourceVersion;
} & (
  | { domain: "workspace"; repositoryId: string }
  | { domain: "journal" | "todo"; repositoryId?: never }
);

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
}: CtnSearchDocumentInput): SearchDocument {
  const common = {
    blocks: projectBlocks({ analysis, textMode }),
    editableText,
    resourceId,
    title,
    updatedAt,
    version,
  };

  return domain === "workspace"
    ? { ...common, domain, repositoryId }
    : { ...common, domain };
}
