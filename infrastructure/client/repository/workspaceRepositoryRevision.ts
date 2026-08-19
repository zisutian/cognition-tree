import { serializeWorkspaceRepositoryRevisionContent } from "../../../contracts/workspace/revision";
import type { RepositoryRevisionDto } from "../../../contracts/workspace/types";
import type { WorkspaceRepositoryContent } from "../../../application/repository/workspaceRepository";

export async function createWorkspaceRepositoryRevision(
  content: WorkspaceRepositoryContent,
): Promise<RepositoryRevisionDto> {
  const bytes = new TextEncoder().encode(
    serializeWorkspaceRepositoryRevisionContent(content),
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return `sha256:${hex}`;
}
