import { describe, expect, it } from "vitest";
import { projectSystemRepositoryRuntimeIssues } from "../../../src/application/repository/projectSystemRepositoryIssues";
import type { SystemRepositorySession } from "../../../src/application/repository/useSystemRepositorySession";

type SessionState = Pick<SystemRepositorySession, "state">;

describe("system repository runtime issue projection", () => {
  it("adds independent session failures and does not duplicate catalog faults", () => {
    const sessions: Record<"system-journal" | "system-todo", SessionState> = {
      "system-journal": {
        state: {
          errorMessage: "journal session failed",
          purpose: "system-journal",
          status: "failed",
        },
      },
      "system-todo": {
        state: {
          errorMessage: "todo session failed",
          purpose: "system-todo",
          status: "failed",
        },
      },
    };

    expect(projectSystemRepositoryRuntimeIssues({
      issues: [{
        code: "repository_corrupt",
        id: "system-journal",
        location: null,
        message: "journal catalog fault",
        status: "fault",
      }],
      repositories: [
        {
          id: "system-journal",
          label: "日记",
          location: { databaseName: "journal-db", type: "browser" },
          protected: true,
        },
        {
          id: "system-todo",
          label: "代办",
          location: { databaseName: "todo-db", type: "browser" },
          protected: true,
        },
      ],
      sessions,
    })).toEqual([
      expect.objectContaining({
        id: "system-journal",
        message: "journal catalog fault",
      }),
      {
        code: "session_load_failed",
        id: "system-todo",
        location: { databaseName: "todo-db", type: "browser" },
        message: "todo session failed",
        status: "fault",
      },
    ]);
  });

  it("exposes ready-session conflict and persistence errors as repository faults", () => {
    const createReadyState = (
      purpose: "system-journal" | "system-todo",
      persistence: Extract<
        SystemRepositorySession["state"],
        { status: "ready" }
      >["persistence"],
    ): Extract<SystemRepositorySession["state"], { status: "ready" }> => {
      const content = purpose === "system-journal"
        ? { entries: [], purpose, schemaVersion: 1 as const }
        : { collections: [], purpose, schemaVersion: 1 as const };

      return {
        content,
        persistence,
        purpose,
        snapshot: {
          conflictRevision: null,
          content,
          localRevision: `draft:${purpose}`,
          pendingChanges: true,
          remoteRevision: `sha256:${purpose}`,
        },
        status: "ready",
      };
    };

    expect(projectSystemRepositoryRuntimeIssues({
      issues: [],
      repositories: [
        {
          id: "system-journal",
          label: "日记",
          location: { databaseName: "journal-db", type: "browser" },
          protected: true,
        },
        {
          id: "system-todo",
          label: "代办",
          location: { databaseName: "todo-db", type: "browser" },
          protected: true,
        },
      ],
      sessions: {
        "system-journal": {
          state: createReadyState("system-journal", {
            remoteRevision: "sha256:remote-journal",
            status: "conflict",
          }),
        },
        "system-todo": {
          state: createReadyState("system-todo", {
            localCopySafe: true,
            message: "todo synchronization failed",
            phase: "sync",
            status: "error",
          }),
        },
      },
    })).toEqual([
      expect.objectContaining({
        code: "repository_conflict",
        id: "system-journal",
      }),
      expect.objectContaining({
        code: "repository_persistence_error",
        id: "system-todo",
        message: "todo synchronization failed",
      }),
    ]);
  });
});
