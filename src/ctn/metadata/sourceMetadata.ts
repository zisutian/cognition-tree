import type { CtnSyntaxProfile } from "../syntax/types";
import {
  parseCtnSourceWithSyntheticMetadata,
} from "../parser/parseCtnDocument";
import {
  formatCtnBlockMetadataLine,
  parseCtnBlockMetadataLine,
} from "./blockMetadata";

export type InitializeCtnSourceBlockMetadataOptions = {
  createId?: () => string;
  createdAt: string;
  updatedAt: string;
};

export function initializeCtnSourceBlockMetadata(
  source: string,
  syntaxProfile: CtnSyntaxProfile,
  {
    createId = () => globalThis.crypto.randomUUID(),
    createdAt,
    updatedAt,
  }: InitializeCtnSourceBlockMetadataOptions,
) {
  const document = parseCtnSourceWithSyntheticMetadata(
    source,
    syntaxProfile,
  );
  const lines = source.split("\n");
  const metadataLines = document.blocks.map((block) =>
    formatCtnBlockMetadataLine({
      createdAt,
      id: createId(),
      indentText: block.indentText,
      updatedAt,
    }),
  );

  for (let index = document.blocks.length - 1; index >= 0; index -= 1) {
    const block = document.blocks[index];

    lines.splice(
      block.lineNumber - 1,
      0,
      metadataLines[index],
    );
  }

  return lines.join("\n");
}

export function inferCtnSourceTitle(source: string) {
  const lines = source.split("\n");
  const titleLineIndex = parseCtnBlockMetadataLine(lines[0] ?? "") ? 1 : 0;

  return lines[titleLineIndex]?.trim() ?? "";
}

export function replaceCtnSourceTitle(
  source: string,
  title: string,
  updatedAt: string,
) {
  const lines = source.split("\n");
  const titleMetadata = parseCtnBlockMetadataLine(lines[0] ?? "");

  if (!titleMetadata) {
    lines[0] = title;
    return lines.join("\n");
  }

  lines[0] = formatCtnBlockMetadataLine({
    ...titleMetadata,
    updatedAt,
  });
  lines[1] = title;
  return lines.join("\n");
}
