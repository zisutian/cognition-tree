import type {
  WorkspaceRepositoryContent,
  WorkspaceRepositorySnapshot,
} from "./workspaceRepository";
import { serializeWorkspaceRepositoryRevisionContent } from "../../../contracts/workspace-repository/revision";

type RevisionContent = Pick<
  WorkspaceRepositorySnapshot,
  "syntaxSourceFile" | "workspace"
> | WorkspaceRepositoryContent;

export async function createWorkspaceRepositoryRevision(
  content: RevisionContent,
) {
  const bytes = new TextEncoder().encode(
    serializeWorkspaceRepositoryRevisionContent(content),
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
