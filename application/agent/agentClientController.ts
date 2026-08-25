// SPDX-License-Identifier: GPL-3.0-or-later

import type { ApplicationScheduler } from "../runtime/applicationScheduler.ts";
import type {
  AgentClientEvent,
  AgentClientEventStream,
  AgentClientPort,
  AgentStatus,
} from "./agentClientPort.ts";
import type {
  AgentProposalView,
  AgentScope,
  AgentSessionSnapshot,
} from "./agentTypes.ts";
import type {
  AgentProfilePreferencePort,
} from "./agentProfilePreference.ts";

export type AgentClientProblem = Readonly<{
  code: string;
  id: string;
  message: string;
  sessionId: string | null;
}>;

export type AgentClientState = Readonly<{
  activeSessionId: string | null;
  errorMessage: string | null;
  loadStatus: "idle" | "loading" | "ready" | "failed";
  operationStatus: "idle" | "working";
  preferredProfileId: string | null;
  problems: readonly AgentClientProblem[];
  sessions: readonly AgentSessionSnapshot[];
  status: AgentStatus | null;
}>;

export type AgentClientController = {
  cancel(): Promise<void>;
  confirmDestruction(proposalId: string): Promise<void>;
  createSession(input: { scope: AgentScope }): Promise<void>;
  decideProposal(
    proposalId: string,
    decision: "approve" | "reject",
  ): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  dispose(): void;
  getSnapshot(): AgentClientState;
  refreshStatus(): Promise<void>;
  reload(): Promise<void>;
  selectSession(sessionId: string): void;
  setPreferredProfile(profileId: string | null): void;
  sendMessage(content: string): Promise<void>;
  start(): void;
  subscribe(listener: () => void): () => void;
};

const reconnectDelayMilliseconds = 1_000;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Agent operation failed.";
}

function replaceSession(
  sessions: readonly AgentSessionSnapshot[],
  session: AgentSessionSnapshot,
) {
  const existing = sessions.findIndex(({ id }) => id === session.id);

  if (existing < 0) return [...sessions, session];
  const next = [...sessions];

  next[existing] = session;
  return next;
}

function replaceProposal(
  proposals: readonly AgentProposalView[],
  proposal: AgentProposalView,
) {
  const existing = proposals.findIndex(({ id }) => id === proposal.id);

  if (existing < 0) return [...proposals, proposal];
  const next = [...proposals];

  next[existing] = proposal;
  return next;
}

function projectConfigurationProblems(status: AgentStatus): AgentClientProblem[] {
  return status.configurationProblem
    ? [{
        code: "configuration_unavailable",
        id: "agent-configuration-problem",
        message: status.configurationProblem,
        sessionId: null,
      }]
    : [];
}

export function createAgentClientController({
  flushScope,
  port,
  profilePreference,
  scheduler,
}: {
  flushScope(scope: AgentScope): Promise<void>;
  port: AgentClientPort;
  profilePreference: AgentProfilePreferencePort;
  scheduler: Pick<ApplicationScheduler, "schedule">;
}): AgentClientController {
  const listeners = new Set<() => void>();
  let activeEventStream: AgentClientEventStream | null = null;
  let activeRecovery: Promise<void> | null = null;
  let activeRecoverySessionId: string | null = null;
  let cancelReconnect: (() => void) | null = null;
  let disposed = false;
  let operationCount = 0;
  let problemSequence = 0;
  let started = false;
  let state: AgentClientState = {
    activeSessionId: null,
    errorMessage: null,
    loadStatus: "idle",
    operationStatus: "idle",
    preferredProfileId: profilePreference.load(),
    problems: [],
    sessions: [],
    status: null,
  };

  const publish = (next: AgentClientState) => {
    if (disposed) return;
    state = next;
    listeners.forEach((listener) => listener());
  };
  const update = (patch: Partial<AgentClientState>) =>
    publish({ ...state, ...patch });
  const reconcilePreferredProfile = (status: AgentStatus) => {
    const profileId = state.preferredProfileId;

    if (!profileId || status.profiles.some(({ id }) => id === profileId)) {
      return profileId;
    }
    profilePreference.clear();
    return null;
  };
  const replaceConfigurationProblems = (status: AgentStatus) => [
    ...state.problems.filter(({ id }) => id !== "agent-configuration-problem"),
    ...projectConfigurationProblems(status),
  ];
  const recordProblem = (
    code: string,
    message: string,
    sessionId: string | null,
  ) => {
    const duplicate = state.problems.find((problem) =>
      problem.code === code &&
      problem.message === message &&
      problem.sessionId === sessionId
    );

    if (duplicate) return;
    problemSequence += 1;
    update({
      problems: [...state.problems, {
        code,
        id: `agent-problem-${problemSequence}`,
        message,
        sessionId,
      }],
    });
  };
  const stopEvents = () => {
    cancelReconnect?.();
    cancelReconnect = null;
    const stream = activeEventStream;

    activeEventStream = null;
    stream?.close();
  };
  const activeSession = () =>
    state.sessions.find(({ id }) => id === state.activeSessionId) ?? null;
  const publishSession = (session: AgentSessionSnapshot) => {
    update({ sessions: replaceSession(state.sessions, session) });
  };

  let connectEvents = () => undefined;
  const reloadState = async () => {
    update({ errorMessage: null, loadStatus: "loading" });
    try {
      const [status, sessions] = await Promise.all([
        port.getStatus(),
        port.listSessions(),
      ]);
      const activeSessionId = sessions.some(({ id }) =>
          id === state.activeSessionId
        )
        ? state.activeSessionId
        : sessions[0]?.id ?? null;

      stopEvents();
      update({
        activeSessionId,
        errorMessage: null,
        loadStatus: "ready",
        preferredProfileId: reconcilePreferredProfile(status),
        problems: replaceConfigurationProblems(status),
        sessions,
        status,
      });
      connectEvents();
    } catch (error) {
      update({ errorMessage: errorMessage(error), loadStatus: "failed" });
      throw error;
    }
  };
  const recoverActiveSession = (force = false): Promise<void> => {
    const sessionId = state.activeSessionId;

    if (!sessionId || disposed) return Promise.resolve();
    if (activeRecovery && activeRecoverySessionId === sessionId) {
      return force
        ? activeRecovery.catch(() => undefined).then(() =>
            recoverActiveSession(false)
          )
        : activeRecovery;
    }
    const recovery = port.getSession(sessionId).then((session) => {
      if (disposed || state.activeSessionId !== sessionId) return;
      publishSession(session);
      stopEvents();
      connectEvents();
    }).catch((error: unknown) => {
      if (!disposed && state.activeSessionId === sessionId) {
        recordProblem("session_refresh_failed", errorMessage(error), sessionId);
      }
      throw error;
    });

    activeRecovery = recovery;
    activeRecoverySessionId = sessionId;
    void recovery.finally(() => {
      if (activeRecovery !== recovery) return;
      activeRecovery = null;
      activeRecoverySessionId = null;
    }).catch(() => undefined);
    return recovery;
  };

  const applyEvent = (event: AgentClientEvent) => {
    const session = activeSession();

    if (!session || event.sessionId !== session.id) return;
    if (event.sequence <= session.sequence) return;
    if (event.sequence !== session.sequence + 1) {
      void recoverActiveSession().catch(() => undefined);
      return;
    }
    if (event.type === "session-snapshot") {
      if (event.snapshot.sequence !== event.sequence) {
        void recoverActiveSession().catch(() => undefined);
        return;
      }
      publishSession(event.snapshot);
      return;
    }
    if (event.type === "message-delta") {
      const messageIndex = session.messages.findIndex(
        ({ id }) => id === event.messageId,
      );

      if (messageIndex < 0) {
        void recoverActiveSession().catch(() => undefined);
        return;
      }
      const messages = [...session.messages];
      const message = messages[messageIndex]!;

      messages[messageIndex] = {
        ...message,
        content: message.content + event.textDelta,
      };
      publishSession({ ...session, messages, sequence: event.sequence });
      return;
    }
    if (event.type === "proposal-updated") {
      publishSession({
        ...session,
        proposals: replaceProposal(session.proposals, event.proposal),
        sequence: event.sequence,
      });
      return;
    }
    if (event.type === "problem") {
      recordProblem(event.code, event.message, event.sessionId);
    }
    publishSession({ ...session, sequence: event.sequence });
  };

  connectEvents = () => {
    const session = activeSession();

    if (!started || disposed || !session || activeEventStream) return;
    activeEventStream = port.openEvents({
      afterSequence: session.sequence,
      onClose(error) {
        if (disposed || !started || state.activeSessionId !== session.id) return;
        activeEventStream = null;
        if (error) {
          recordProblem("event_stream_failed", errorMessage(error), session.id);
        }
        cancelReconnect?.();
        cancelReconnect = scheduler.schedule(() => {
          cancelReconnect = null;
          void reloadState().catch((reloadError: unknown) => {
            if (!error) {
              recordProblem(
                "event_stream_failed",
                errorMessage(reloadError),
                session.id,
              );
            }
          });
        }, reconnectDelayMilliseconds);
      },
      onEvent: applyEvent,
      sessionId: session.id,
    });
  };

  const setActiveSession = (sessionId: string | null) => {
    if (state.activeSessionId === sessionId) return;
    stopEvents();
    update({ activeSessionId: sessionId });
    connectEvents();
  };
  const runOperation = async (operation: () => Promise<void>) => {
    operationCount += 1;
    update({ operationStatus: "working" });
    try {
      await operation();
    } catch (error) {
      recordProblem(
        "client_operation_failed",
        errorMessage(error),
        state.activeSessionId,
      );
      throw error;
    } finally {
      operationCount -= 1;
      update({ operationStatus: operationCount > 0 ? "working" : "idle" });
    }
  };
  const requireActiveSession = () => {
    const session = activeSession();

    if (!session) throw new Error("No Agent session is selected.");
    return session;
  };

  const controller: AgentClientController = {
    cancel: () => runOperation(async () => {
      const session = requireActiveSession();

      await port.cancel(session.id);
      await recoverActiveSession(true);
    }),
    confirmDestruction: (proposalId) => runOperation(async () => {
      const session = requireActiveSession();

      await flushScope(session.scope);
      await port.confirmDestruction(session.id, proposalId);
      await recoverActiveSession(true);
    }),
    createSession: ({ scope }) => runOperation(async () => {
      const profile = state.status?.profiles.find(({ id }) =>
        id === state.preferredProfileId
      );

      if (!profile || profile.availability !== "available") {
        throw new Error("Select an available Agent profile in Settings.");
      }
      const session = await port.createSession({ profileId: profile.id, scope });

      update({ sessions: replaceSession(state.sessions, session) });
      setActiveSession(session.id);
    }),
    decideProposal: (proposalId, decision) => runOperation(async () => {
      const session = requireActiveSession();

      if (decision === "approve") await flushScope(session.scope);
      await port.decideProposal(session.id, proposalId, decision);
      await recoverActiveSession(true);
    }),
    deleteSession: (sessionId) => runOperation(async () => {
      await port.deleteSession(sessionId);
      const sessions = state.sessions.filter(({ id }) => id !== sessionId);
      const nextActive = state.activeSessionId === sessionId
        ? sessions[0]?.id ?? null
        : state.activeSessionId;

      stopEvents();
      update({ activeSessionId: nextActive, sessions });
      connectEvents();
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      stopEvents();
      listeners.clear();
    },
    getSnapshot: () => state,
    refreshStatus: () => runOperation(async () => {
      try {
        const status = await port.getStatus();

        update({
          errorMessage: null,
          loadStatus: "ready",
          preferredProfileId: reconcilePreferredProfile(status),
          problems: replaceConfigurationProblems(status),
          status,
        });
      } catch (error) {
        update({ errorMessage: errorMessage(error), loadStatus: "failed" });
        throw error;
      }
    }),
    reload: () => runOperation(reloadState),
    selectSession(sessionId) {
      if (!state.sessions.some(({ id }) => id === sessionId)) {
        recordProblem(
          "session_unavailable",
          "Agent session no longer exists.",
          sessionId,
        );
        return;
      }
      setActiveSession(sessionId);
      void recoverActiveSession().catch(() => undefined);
    },
    setPreferredProfile(profileId) {
      if (profileId === null) {
        profilePreference.clear();
        update({ preferredProfileId: null });
        return;
      }
      const profile = state.status?.profiles.find(({ id }) => id === profileId);

      if (!profile || profile.availability !== "available") {
        throw new Error("Select an available Agent profile in Settings.");
      }
      profilePreference.save(profile.id);
      update({ preferredProfileId: profile.id });
    },
    sendMessage: (content) => runOperation(async () => {
      const session = requireActiveSession();

      await flushScope(session.scope);
      await port.sendMessage(session.id, content);
      await recoverActiveSession(true);
    }),
    start() {
      if (disposed || started) return;
      started = true;
      void controller.reload().catch(() => undefined);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return controller;
}
