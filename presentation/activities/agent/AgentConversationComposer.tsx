// SPDX-License-Identifier: GPL-3.0-or-later
import { Button, FormActions, FormLayout, TextareaControl } from "compact-ui";
import type { AgentApplication } from "../../../application/agent/index.ts";
import {
  describePage,
  pageKey,
  usePageViewState,
} from "../../navigation/index.ts";
import { useExclusiveAsyncAction, useFeedback } from "../../ui/index.ts";
export function AgentConversationComposer({
  agent,
}: {
  agent: AgentApplication;
}) {
  const feedback = useFeedback();
  const sendAction = useExclusiveAsyncAction();
  const session = agent.state.sessions.find(
    (item) => item.id === agent.state.activeSessionId,
  );
  const key = pageKey(
    describePage("agent", "agent-session", session?.id ?? "empty", "").target,
  );
  const [draft, setDraft] = usePageViewState(key, "draft", "");
  if (!session) return null;
  const canSend =
    !sendAction.busy &&
    session.state === "idle" &&
    agent.state.operationStatus === "idle";
  const send = async () => {
    if (!canSend || !draft.trim()) return;
    const pending = sendAction.run(() =>
      feedback.runAction(async () => {
        await agent.controller.sendMessage(draft);
        return true;
      }),
    );
    if (pending && (await pending)) setDraft("");
  };
  return (
    <FormLayout
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <TextareaControl
        aria-label="给 Agent 的消息"
        disabled={!canSend}
        maxLength={100_000}
        onChange={(event) => setDraft(event.currentTarget.value)}
        placeholder="消息"
        rows={4}
        sizing="fill"
        value={draft}
      />
      <FormActions>
        <Button disabled={!canSend || !draft.trim()} type="submit">
          发送
        </Button>
      </FormActions>
    </FormLayout>
  );
}
