// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type {
  AgentRuntimePort,
  AgentRuntimeTurnRequest,
} from "../../../../application/agent/agentRuntimePort.ts";
import {
  prepareAgentJournalCommand,
} from "../../../../application/journal/journalAgentCommandPreparation.ts";
import { listJournalEntries } from "../../../../core/journal/model/journalContent.ts";
import { BuiltInCatalog } from "../../../../infrastructure/server/repository/built-ins/catalog.ts";
import type {
  WorkspaceRepositoryCatalog,
} from "../../../../infrastructure/server/repository/catalog.ts";
import { AgentOperationLedger } from "../../../../infrastructure/server/agent/operationLedger.ts";
import type {
  AgentProfileCatalog,
  OpenAiChatAgentProfile,
} from "../../../../infrastructure/server/agent/profiles.ts";
import {
  AgentService,
  AgentServiceError,
} from "../../../../infrastructure/server/agent/service.ts";
import { ApiEventHub } from "../../../../infrastructure/server/api/sync/events.ts";
import { ApiRevisionTracker } from "../../../../infrastructure/server/api/sync/revisionTracker.ts";
import { ApiSearchService } from "../../../../infrastructure/server/api/search.ts";
import { journalResourceVersions } from "../../../../infrastructure/server/api/resources/versions.ts";
import type { ApiRuntime } from "../../../../infrastructure/server/api/http/runtime.ts";

const journalScope = { domain: "journal" as const, entryIds: null };

function uuid(index: number) {
  return `00000000-0000-4000-8000-${
    String(index).padStart(12, "0")
  }` as `${string}-${string}-${string}-${string}-${string}`;
}

function createRuntime(): ApiRuntime {
  let nextId = 1;

  return {
    createId: () => uuid(nextId++),
    now: () => new Date("2026-08-20T08:00:00.000Z"),
    timezoneOffsetMinutes: () => 480,
    today: () => "2026-08-20",
  };
}

function profile(): OpenAiChatAgentProfile {
  return {
    apiKeyEnv: "TEST_AGENT_KEY",
    baseUrl: "https://runtime.invalid/v1",
    contextWindowTokens: 8_192,
    id: "fake-openai",
    kind: "openai-chat",
    label: "Fake OpenAI",
    maxOutputTokens: 1_024,
    maxResidentSessions: 2,
    maxToolSteps: 8,
    model: "fake",
    timeoutMilliseconds: 5_000,
  };
}

function profileCatalog(config: OpenAiChatAgentProfile): AgentProfileCatalog {
  return {
    absoluteTtlMilliseconds: 24 * 60 * 60 * 1_000,
    configurationProblem: null,
    idleTtlMilliseconds: 60 * 60 * 1_000,
    maxAuditEntries: 100,
    profiles: [{
      availability: "available",
      config,
      id: config.id,
      kind: config.kind,
      label: config.label,
      unavailableReason: null,
    }],
  };
}

const unavailableWorkspaceCatalog: WorkspaceRepositoryCatalog = {
  async createRepository() {
    throw new Error("Workspace is outside this test");
  },
  async deleteRepository() {
    throw new Error("Workspace is outside this test");
  },
  async getStore() {
    throw new Error("Workspace is outside this test");
  },
  async listRepositories() {
    return { creatableAdapters: [], issues: [], repositories: [] };
  },
  async renameRepository() {
    throw new Error("Workspace is outside this test");
  },
};

type TurnBehavior = (
  request: AgentRuntimeTurnRequest,
) => Promise<{ finalText: string; toolCalls: number }>;

async function createFixture(behavior: TurnBehavior) {
  const root = await mkdtemp(path.join(os.tmpdir(), "ctn-agent-service-"));
  const builtInCatalog = new BuiltInCatalog(root);

  await builtInCatalog.initialize();
  const runtime = createRuntime();
  const runTurn = vi.fn(async (request: AgentRuntimeTurnRequest) =>
    request.tools.length === 0
      ? { finalText: "Commit completed.", toolCalls: 0 }
      : behavior(request)
  );
  const runtimePort: AgentRuntimePort = {
    kind: "openai-chat",
    async openSession() {
      return {
        cancel: vi.fn(async () => undefined),
        dispose: vi.fn(async () => undefined),
        runTurn,
      };
    },
  };
  const ledger = new AgentOperationLedger(path.join(root, "state"), 100);
  const service = new AgentService({
    builtInCatalog,
    catalog: unavailableWorkspaceCatalog,
    environment: { TEST_AGENT_KEY: "server-secret" },
    eventHub: new ApiEventHub(uuid(900)),
    ledger,
    profileCatalog: profileCatalog(profile()),
    revisionTracker: new ApiRevisionTracker(),
    runtime,
    runtimeFactory: () => runtimePort,
    search: new ApiSearchService({
      builtInCatalog,
      catalog: unavailableWorkspaceCatalog,
    }),
  });

  return {
    builtInCatalog,
    ledger,
    root,
    runTurn,
    runtime,
    service,
    async cleanup() {
      await service.dispose();
      await rm(root, { force: true, recursive: true });
    },
  };
}

async function waitForProposal(service: AgentService, sessionId: string) {
  await vi.waitFor(() => {
    expect(service.getSession(sessionId).state).toBe("awaiting-approval");
  });
  return service.getSession(sessionId).proposals[0]!;
}

function createTwoEntries(request: AgentRuntimeTurnRequest) {
  return (async () => {
    for (const body of ["First staged entry", "Second staged entry"]) {
      await request.executeTool({
        arguments: { body, kind: "create-entry" },
        callId: uuid(body.length),
        name: "stage_journal_command",
      });
    }
    await request.executeTool({
      arguments: {},
      callId: uuid(100),
      name: "submit_proposal",
    });
    await request.onEvent({ textDelta: "Proposal ready.", type: "text-delta" });
    return { finalText: "Proposal ready.", toolCalls: 3 };
  })();
}

describe("Agent service proposal lifecycle", () => {
  it("serializes turns FIFO per profile and rejects resident overflow", async () => {
    const started: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const fixture = await createFixture(async (request) => {
      const message = [...request.messages].reverse().find(({ role }) =>
        role === "user"
      )?.content ?? "";

      started.push(message);
      if (message === "first") await firstGate;
      return { finalText: message, toolCalls: 0 };
    });

    try {
      const first = await fixture.service.createSession({
        profileId: "fake-openai",
        scope: journalScope,
      });
      const second = await fixture.service.createSession({
        profileId: "fake-openai",
        scope: journalScope,
      });

      fixture.service.sendMessage(first.id, "first");
      fixture.service.sendMessage(second.id, "second");
      await vi.waitFor(() => expect(started).toEqual(["first"]));
      expect(fixture.service.getSession(second.id).state).toBe("queued");
      await expect(fixture.service.createSession({
        profileId: "fake-openai",
        scope: journalScope,
      })).rejects.toMatchObject({ code: "session_capacity_reached" });
      releaseFirst();
      await vi.waitFor(() => {
        expect(fixture.service.getSession(first.id).state).toBe("idle");
        expect(fixture.service.getSession(second.id).state).toBe("idle");
      });
      expect(started).toEqual(["first", "second"]);
    } finally {
      releaseFirst();
      await fixture.cleanup();
    }
  });

  it("aggregates sequential staging, commits once, and replays approval idempotently", async () => {
    const fixture = await createFixture(createTwoEntries);

    try {
      const session = await fixture.service.createSession({
        profileId: "fake-openai",
        scope: journalScope,
      });
      fixture.service.sendMessage(session.id, "Create two entries");
      const proposal = await waitForProposal(fixture.service, session.id);
      const before = await fixture.builtInCatalog.getStore("journal").then(
        (store) => store.loadSnapshot(),
      );

      expect(proposal.changes.resources.filter(({ kind }) => kind === "created"))
        .toHaveLength(2);
      expect(proposal.diff).toHaveLength(2);
      expect(before.revision).toBe(proposal.baseRevision);
      const committed = await fixture.service.decideProposal({
        decision: "approve",
        ownerId: "local-owner",
        proposalId: proposal.id,
        sessionId: session.id,
      });

      expect(committed.status).toBe("committed");
      const after = await fixture.builtInCatalog.getStore("journal").then(
        (store) => store.loadSnapshot(),
      );

      expect(after.revision).not.toBe(before.revision);
      expect(listJournalEntries(after.content)).toHaveLength(2);
      await fixture.service.decideProposal({
        decision: "approve",
        ownerId: "local-owner",
        proposalId: proposal.id,
        sessionId: session.id,
      });
      await vi.waitFor(() => expect(fixture.runTurn).toHaveBeenCalledTimes(2));
      expect((await fixture.ledger.list({ cursor: 0, limit: 10 })).entries)
        .toHaveLength(1);
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects the whole proposal without writing content", async () => {
    const fixture = await createFixture(createTwoEntries);

    try {
      const session = await fixture.service.createSession({
        profileId: "fake-openai",
        scope: journalScope,
      });
      const store = await fixture.builtInCatalog.getStore("journal");
      const before = await store.loadSnapshot();

      fixture.service.sendMessage(session.id, "Prepare but do not commit");
      const proposal = await waitForProposal(fixture.service, session.id);
      const rejected = await fixture.service.decideProposal({
        decision: "reject",
        ownerId: "local-owner",
        proposalId: proposal.id,
        sessionId: session.id,
      });

      expect(rejected.status).toBe("rejected");
      expect((await store.loadSnapshot()).revision).toBe(before.revision);
      expect((await fixture.ledger.list({ cursor: 0, limit: 10 })).entries)
        .toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("marks an approved proposal stale after any intervening store revision", async () => {
    const fixture = await createFixture(createTwoEntries);

    try {
      const session = await fixture.service.createSession({
        profileId: "fake-openai",
        scope: journalScope,
      });

      fixture.service.sendMessage(session.id, "Prepare a stale proposal");
      const proposal = await waitForProposal(fixture.service, session.id);
      const store = await fixture.builtInCatalog.getStore("journal");
      const current = await store.loadSnapshot();
      const external = prepareAgentJournalCommand({
        intent: { body: "External change", kind: "create-entry" },
        runtime: fixture.runtime,
        snapshot: current,
        versionPolicy: journalResourceVersions,
      });

      await store.commit({
        baseRevision: current.revision,
        content: external.content,
        projection: external.projection,
      });
      await expect(fixture.service.decideProposal({
        decision: "approve",
        ownerId: "local-owner",
        proposalId: proposal.id,
        sessionId: session.id,
      })).rejects.toMatchObject({
        code: "proposal_stale",
      } satisfies Partial<AgentServiceError>);
      expect(fixture.service.getSession(session.id).proposals[0]?.status)
        .toBe("stale");
      expect((await fixture.ledger.list({ cursor: 0, limit: 10 })).entries[0])
        .toMatchObject({ result: "stale" });
      expect(listJournalEntries((await store.loadSnapshot()).content))
        .toHaveLength(1);
    } finally {
      await fixture.cleanup();
    }
  });

  it("requires the independent destructive confirmation before deleting", async () => {
    let entryId = "";
    const fixture = await createFixture(async (request) => {
      await request.executeTool({
        arguments: { entryId, kind: "delete-entry" },
        callId: uuid(200),
        name: "stage_journal_command",
      });
      await request.executeTool({
        arguments: {},
        callId: uuid(201),
        name: "submit_proposal",
      });
      return { finalText: "Destructive proposal ready.", toolCalls: 2 };
    });

    try {
      const store = await fixture.builtInCatalog.getStore("journal");
      const empty = await store.loadSnapshot();
      const seeded = prepareAgentJournalCommand({
        intent: { body: "Delete me", kind: "create-entry" },
        runtime: fixture.runtime,
        snapshot: empty,
        versionPolicy: journalResourceVersions,
      });

      if (seeded.outcome.kind !== "journal-entry-created") {
        throw new Error("Journal seed was not created");
      }
      entryId = seeded.outcome.entryId;
      await store.commit({
        baseRevision: empty.revision,
        content: seeded.content,
        projection: seeded.projection,
      });
      const session = await fixture.service.createSession({
        profileId: "fake-openai",
        scope: journalScope,
      });

      fixture.service.sendMessage(session.id, "Delete the entry");
      const proposal = await waitForProposal(fixture.service, session.id);
      const revisionBeforeDecision = (await store.loadSnapshot()).revision;
      const awaiting = await fixture.service.decideProposal({
        decision: "approve",
        ownerId: "local-owner",
        proposalId: proposal.id,
        sessionId: session.id,
      });

      expect(awaiting.status).toBe("awaiting-destructive-confirmation");
      expect((await store.loadSnapshot()).revision).toBe(revisionBeforeDecision);
      const committed = await fixture.service.confirmDestruction({
        ownerId: "local-owner",
        proposalId: proposal.id,
        sessionId: session.id,
      });

      expect(committed.status).toBe("committed");
      expect(listJournalEntries((await store.loadSnapshot()).content))
        .toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });
});
