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
