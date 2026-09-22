import { Tree, Stack, StatusText } from "compact-ui";
import { MessageSquare } from "lucide-react";
import type { AgentApplication } from "../../../application/agent/index.ts";
import { useFeedback } from "../../ui/index.ts";
import { usePageNavigation, describePage } from "../../navigation/index.ts";
import {
  agentSessionStateLabels,
  formatAgentScopeLabel,
} from "./agentViewLabels.ts";
export function AgentContextPanel({
  agent,
  creatingSession,
  onSelectSession,
}: {
  agent: AgentApplication;
  creatingSession: boolean;
  onSelectSession(): void;
}) {
  const feedback = useFeedback(),
    pages = usePageNavigation(),
    { state, controller } = agent;
  return (
    <Stack fill>
      {state.loadStatus === "loading" ? (
        <StatusText>正在读取 Agent 状态…</StatusText>
      ) : state.loadStatus === "failed" ? (
        <StatusText mode="live" tone="danger">
          {state.errorMessage}
        </StatusText>
      ) : null}
      <Tree
        aria-label="Agent 会话"
        nodes={state.sessions.map((session) => ({
          id: session.id,
          label: `${session.profileLabel} · ${formatAgentScopeLabel(session.scope)} · ${agentSessionStateLabels[session.state]}`,
          icon: <MessageSquare />,
        }))}
        selectedId={creatingSession ? null : state.activeSessionId}
        expandedIds={new Set()}
        onExpandedChange={() => {}}
        onSelect={() => {}}
        onOpen={(id, intent) => {
          const session = state.sessions.find((s) => s.id === id);
          if (session)
            pages.open(
              describePage("agent", "agent-session", id, session.profileLabel),
              intent,
              () => {
                controller.selectSession(id);
                onSelectSession();
              },
            );
        }}
        capabilities={{ delete: state.operationStatus !== "working" }}
        onDelete={(id) => controller.deleteSession(id)}
        onActionError={feedback.notifyError}
      />
    </Stack>
  );
}
