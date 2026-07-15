const repositoryBlockMetadataDirective = "@ctn-block";

export function inferRepositoryNoteTitle(source: string) {
  const lines = source.split("\n");
  const titleLineIndex = lines[0]?.trimStart().startsWith(
    repositoryBlockMetadataDirective,
  )
    ? 1
    : 0;

  return lines[titleLineIndex]?.trim() ?? "";
}
