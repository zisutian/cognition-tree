import { useSingleTreeSelection } from "../../ui/index.ts";
import { Button, Tree, Stack, StatusText } from "compact-ui";
import { MessageSquare } from "lucide-react";
import type {
  AgentApplication,
} from "../../../application/agentClient/index.ts";
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
  const treeSelection = useSingleTreeSelection(creatingSession ? null : state.activeSessionId);
  return (
    <Stack fill>
      {state.loadStatus === "loading" ? (
        <StatusText>正在读取 Agent 状态…</StatusText>
      ) : state.loadStatus === "failed" ? (
        <Button onClick={() => void feedback.runAction(controller.reload)}>
          重试加载会话
        </Button>
      ) : null}
      <Tree
        aria-label="Agent 会话"
        nodes={state.sessions.map((session) => ({
          id: session.id,
          label: `${session.profileLabel} · ${formatAgentScopeLabel(session.scope)} · ${agentSessionStateLabels[session.state]}`,
          icon: <MessageSquare />,
        }))}
        expandedIds={new Set()}
        onExpandedChange={() => {}}
        {...treeSelection}
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
