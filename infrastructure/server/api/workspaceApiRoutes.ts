// SPDX-License-Identifier: GPL-3.0-or-later

import type { BuiltInIdDto } from "../../../contracts/built-ins/types.ts";
import { WorkspaceApiRequestError } from "./workspaceApiErrors.ts";

export const workspaceApiAllowedMethods =
  "DELETE, GET, OPTIONS, PATCH, POST, PUT";

export type WorkspaceApiRoute =
  | { kind: "health"; methods: readonly string[] }
  | { kind: "repositories"; methods: readonly string[] }
  | { kind: "built-ins"; methods: readonly string[] }
  | {
      id: BuiltInIdDto;
      kind: "built-in-retry";
      methods: readonly string[];
    }
  | {
      id: BuiltInIdDto;
      kind: "built-in-snapshot";
      methods: readonly string[];
    }
  | {
      kind: "repository";
      methods: readonly string[];
      repositoryId: string;
    }
  | {
      kind: "repository-snapshot";
      methods: readonly string[];
      repositoryId: string;
    }
  | { kind: "mobile-status"; methods: readonly string[] }
  | { kind: "mobile-journal-entries"; methods: readonly string[] }
  | {
      entryId: string;
      kind: "mobile-journal-entry";
      methods: readonly string[];
    }
  | { kind: "mobile-todo-collections"; methods: readonly string[] }
  | {
      collectionId: string;
      kind: "mobile-todo-collection";
      methods: readonly string[];
    }
  | {
      blockId: string;
      collectionId: string;
      kind: "mobile-todo-completion";
      methods: readonly string[];
    }
  | { kind: "mobile-v2-status"; methods: readonly string[] }
  | { kind: "mobile-v2-journal-entries"; methods: readonly string[] }
  | {
      entryId: string;
      kind: "mobile-v2-journal-entry";
      methods: readonly string[];
    }
  | { kind: "mobile-v2-todo-collections"; methods: readonly string[] }
  | {
      collectionId: string;
      kind: "mobile-v2-todo-collection";
      methods: readonly string[];
    }
  | {
      blockId: string;
      collectionId: string;
      kind: "mobile-v2-todo-completion";
      methods: readonly string[];
    };

function decodeRepositoryId(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new WorkspaceApiRequestError(
      "invalid_request",
      "Invalid repository id encoding",
    );
  }
}

function decodeMobileId(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new WorkspaceApiRequestError(
      "invalid_request",
      "Invalid mobile resource id encoding",
    );
  }
}

export function resolveWorkspaceApiRoute(
  pathname: string,
): WorkspaceApiRoute | null {
  if (pathname === "/api/health") {
    return { kind: "health", methods: ["GET"] };
  }
  if (pathname === "/api/repositories") {
    return { kind: "repositories", methods: ["GET", "POST"] };
  }
  if (pathname === "/api/built-ins") {
    return { kind: "built-ins", methods: ["GET"] };
  }
  if (pathname === "/api/mobile/v2/status") {
    return { kind: "mobile-v2-status", methods: ["GET"] };
  }
  if (pathname === "/api/mobile/v2/journal/entries") {
    return { kind: "mobile-v2-journal-entries", methods: ["GET"] };
  }
  const mobileV2JournalEntryMatch =
    /^\/api\/mobile\/v2\/journal\/entries\/([^/]+)$/.exec(pathname);

  if (mobileV2JournalEntryMatch) {
    return {
      entryId: decodeMobileId(mobileV2JournalEntryMatch[1] ?? ""),
      kind: "mobile-v2-journal-entry",
      methods: ["GET"],
    };
  }
  if (pathname === "/api/mobile/v2/todo/collections") {
    return { kind: "mobile-v2-todo-collections", methods: ["GET"] };
  }
  const mobileV2TodoCompletionMatch =
    /^\/api\/mobile\/v2\/todo\/collections\/([^/]+)\/tasks\/([^/]+)\/completion$/
      .exec(pathname);

  if (mobileV2TodoCompletionMatch) {
    return {
      blockId: decodeMobileId(mobileV2TodoCompletionMatch[2] ?? ""),
      collectionId: decodeMobileId(mobileV2TodoCompletionMatch[1] ?? ""),
      kind: "mobile-v2-todo-completion",
      methods: ["PUT"],
    };
  }
  const mobileV2TodoCollectionMatch =
    /^\/api\/mobile\/v2\/todo\/collections\/([^/]+)$/.exec(pathname);

  if (mobileV2TodoCollectionMatch) {
    return {
      collectionId: decodeMobileId(mobileV2TodoCollectionMatch[1] ?? ""),
      kind: "mobile-v2-todo-collection",
      methods: ["GET"],
    };
  }
  if (pathname === "/api/mobile/v1/status") {
    return { kind: "mobile-status", methods: ["GET"] };
  }
  if (pathname === "/api/mobile/v1/journal/entries") {
    return { kind: "mobile-journal-entries", methods: ["GET"] };
  }
  const mobileJournalEntryMatch =
    /^\/api\/mobile\/v1\/journal\/entries\/([^/]+)$/.exec(pathname);

  if (mobileJournalEntryMatch) {
    return {
      entryId: decodeMobileId(mobileJournalEntryMatch[1] ?? ""),
      kind: "mobile-journal-entry",
      methods: ["GET"],
    };
  }
  if (pathname === "/api/mobile/v1/todo/collections") {
    return { kind: "mobile-todo-collections", methods: ["GET"] };
  }
  const mobileTodoCompletionMatch =
    /^\/api\/mobile\/v1\/todo\/collections\/([^/]+)\/tasks\/([^/]+)\/completion$/
      .exec(pathname);

  if (mobileTodoCompletionMatch) {
    return {
      blockId: decodeMobileId(mobileTodoCompletionMatch[2] ?? ""),
      collectionId: decodeMobileId(mobileTodoCompletionMatch[1] ?? ""),
      kind: "mobile-todo-completion",
      methods: ["PUT"],
    };
  }
  const mobileTodoCollectionMatch =
    /^\/api\/mobile\/v1\/todo\/collections\/([^/]+)$/.exec(pathname);

  if (mobileTodoCollectionMatch) {
    return {
      collectionId: decodeMobileId(mobileTodoCollectionMatch[1] ?? ""),
      kind: "mobile-todo-collection",
      methods: ["GET"],
    };
  }
  const builtInSnapshotMatch = /^\/api\/(journal|todo)\/snapshot$/.exec(
    pathname,
  );

  if (builtInSnapshotMatch) {
    return {
      id: builtInSnapshotMatch[1] as BuiltInIdDto,
      kind: "built-in-snapshot",
      methods: ["GET", "PUT"],
    };
  }
  const builtInRetryMatch = /^\/api\/(journal|todo)\/retry$/.exec(pathname);

  if (builtInRetryMatch) {
    return {
      id: builtInRetryMatch[1] as BuiltInIdDto,
      kind: "built-in-retry",
      methods: ["POST"],
    };
  }
  const snapshotMatch = /^\/api\/repositories\/([^/]+)\/snapshot$/.exec(
    pathname,
  );

  if (snapshotMatch) {
    return {
      kind: "repository-snapshot",
      methods: ["GET", "PUT"],
      repositoryId: decodeRepositoryId(snapshotMatch[1] ?? ""),
    };
  }
  const repositoryMatch = /^\/api\/repositories\/([^/]+)$/.exec(pathname);

  if (repositoryMatch) {
    return {
      kind: "repository",
      methods: ["DELETE", "PATCH"],
      repositoryId: decodeRepositoryId(repositoryMatch[1] ?? ""),
    };
  }
  return null;
}
