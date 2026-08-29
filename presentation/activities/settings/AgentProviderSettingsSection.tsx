// SPDX-License-Identifier: GPL-3.0-or-later

import { useState, type FormEvent } from "react";
import type { AgentApplication } from "../../../application/agent";
import { useFeedback } from "../../ui/shared/FeedbackProvider";
import {
  ManagementList,
  ManagementRow,
} from "../../ui/shared/ManagementList";
import { Button, EmptyState } from "../../ui/shared/primitives";
import { StatusBadge } from "../../ui/shared/StatusPresentation";
import { ToolSection } from "../../ui/shared/ToolSurface";
import {
  agentProviderDraftFrom,
  agentProviderInput,
  createAgentProviderDraft,
  type AgentProviderDraft,
} from "./agentSettingsDraft";
import { AgentProviderSettingsForm } from "./AgentProviderSettingsForm";
import type { AgentSettingsRoute } from "./settingsTypes";

type ProviderRoute = Extract<AgentSettingsRoute, { page: "providers" }>;

type ProviderDraftSession =
  | { status: "closed" }
  | { draft: AgentProviderDraft; status: "creating" }
  | { draft: AgentProviderDraft; providerId: string; status: "editing" };

const authenticationLabels = {
  configured: "认证已配置",
  missing: "认证未配置",
  "not-required": "无需认证",
  unknown: "认证状态未知",
} as const;

export function AgentProviderSettingsSection({
  agent,
  busy,
  onRouteChange,
  route,
}: {
  agent: AgentApplication;
  busy: boolean;
  onRouteChange(route: ProviderRoute): void;
  route: ProviderRoute;
}) {
  const feedback = useFeedback();
  const [draftSession, setDraftSession] = useState<ProviderDraftSession>({
    status: "closed",
  });
  const providers = agent.configurationState.configuration?.providers ?? [];

  const submitProvider = (event: FormEvent) => {
    event.preventDefault();
    if (draftSession.status === "closed") return;
    const input = agentProviderInput(draftSession.draft);

    void feedback.runAction(async () => {
      if (draftSession.status === "editing") {
        await agent.configurationController.updateProvider(
          draftSession.providerId,
          input,
        );
        onRouteChange({
          page: "providers",
          selectedProviderId: draftSession.providerId,
        });
      } else {
        const previousIds = new Set(providers.map(({ id }) => id));
        await agent.configurationController.createProvider(input);
        const created = agent.configurationController.getSnapshot().configuration
          ?.providers.find(({ id }) => !previousIds.has(id));

        if (created) {
          onRouteChange({
            page: "providers",
            selectedProviderId: created.id,
          });
        }
      }
      setDraftSession({ status: "closed" });
    });
  };

  if (draftSession.status !== "closed") {
    return (
      <ToolSection
        title={draftSession.status === "editing"
          ? "编辑 Provider"
          : "新建 Provider"}
      >
        <AgentProviderSettingsForm
          busy={busy}
          draft={draftSession.draft}
          editing={draftSession.status === "editing"}
          onCancel={() => setDraftSession({ status: "closed" })}
          onChange={(draft) => setDraftSession({ ...draftSession, draft })}
          onSubmit={submitProvider}
        />
      </ToolSection>
    );
  }

  return (
    <ToolSection
      actions={(
        <Button
          onClick={() => setDraftSession({
            draft: createAgentProviderDraft(),
            status: "creating",
          })}
          type="button"
          variant="primary"
        >
          新建 Provider
        </Button>
      )}
      title="Provider"
    >
      {providers.length === 0 ? (
        <EmptyState compact title="尚未创建 Provider" />
      ) : (
        <ManagementList aria-label="Provider 列表">
          {providers.map((provider, index) => {
            const login = agent.configurationState.codexDeviceLogins[provider.id];

            return (
              <ManagementRow
                actions={(
                  <>
                    <Button
                      disabled={busy}
                      onClick={() => void feedback.runAction(() =>
                        agent.configurationController.probeProvider(provider.id)
                      )}
                      type="button"
                    >
                      探测
                    </Button>
                    {provider.kind === "codex"
                      && provider.authenticationType === "chatgpt-device-code"
                      && login?.status !== "pending" ? (
                        <Button
                          disabled={busy}
                          onClick={() => void feedback.runAction(() =>
                            agent.configurationController.startCodexDeviceLogin(
                              provider.id,
                            )
                          )}
                          type="button"
                        >
                          使用 ChatGPT 登录
                        </Button>
                      ) : null}
                    {login?.status === "pending" ? (
                      <Button
                        disabled={busy}
                        onClick={() => void feedback.runAction(() =>
                          agent.configurationController.cancelCodexDeviceLogin(
                            provider.id,
                          )
                        )}
                        type="button"
                      >
                        取消登录
                      </Button>
                    ) : null}
                    {provider.authenticationStatus === "configured" ? (
                      <Button
                        disabled={busy}
                        onClick={() => void feedback.runAction(() =>
                          agent.configurationController
                            .clearProviderAuthentication(provider.id)
                        )}
                        type="button"
                      >
                        退出认证
                      </Button>
                    ) : null}
                    <Button
                      disabled={busy}
                      onClick={() => setDraftSession({
                        draft: agentProviderDraftFrom(provider),
                        providerId: provider.id,
                        status: "editing",
                      })}
                      type="button"
                    >
                      编辑
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() => void feedback.runAction(async () => {
                        await agent.configurationController.deleteProvider(
                          provider.id,
                        );
                        const remaining = agent.configurationController
                          .getSnapshot().configuration?.providers ?? [];
                        const next = remaining[
                          Math.min(index, Math.max(0, remaining.length - 1))
                        ];

                        onRouteChange({
                          page: "providers",
                          selectedProviderId: next?.id ?? null,
                        });
                      })}
                      type="button"
                      variant="danger"
                    >
                      删除
                    </Button>
                  </>
                )}
                key={provider.id}
                onSelect={() => onRouteChange({
                  page: "providers",
                  selectedProviderId: provider.id,
                })}
                selected={route.selectedProviderId === provider.id}
                status={(
                  <StatusBadge
                    tone={provider.authenticationStatus === "missing"
                      ? "warning"
                      : "success"}
                  >
                    {authenticationLabels[provider.authenticationStatus]}
                  </StatusBadge>
                )}
                title={`${provider.label} · v${provider.version}`}
              />
            );
          })}
        </ManagementList>
      )}
    </ToolSection>
  );
}
