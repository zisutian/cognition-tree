import type {
  WorkspaceRepositoryContent,
  WorkspaceRepositorySnapshot,
} from "./workspaceRepository";

type RevisionContent = Pick<
  WorkspaceRepositorySnapshot,
  "syntaxSourceFile" | "workspace"
> | WorkspaceRepositoryContent;

function createCanonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(createCanonicalValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) =>
          left < right ? -1 : left > right ? 1 : 0,
        )
        .map(([key, fieldValue]) => [key, createCanonicalValue(fieldValue)]),
    );
  }

  return value;
}

export async function createWorkspaceRepositoryRevision(
  content: RevisionContent,
) {
  const bytes = new TextEncoder().encode(
    JSON.stringify(createCanonicalValue(content)),
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
