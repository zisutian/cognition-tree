// SPDX-License-Identifier: GPL-3.0-or-later

import { useMemo, useState, type FormEvent } from "react";
import type { AgentApplication } from "../../../application/agent/index.ts";
import {
  useFeedback,
  ManagementList,
  ManagementRow,
  Button,
  EmptyState,
  StatusBadge,
  ToolSection,
} from "../../ui/index.ts";




import {
  agentProfileDraftFrom,
  agentProfileInput,
  createAgentProfileDraft,
  type AgentProfileDraft,
} from "./agentSettingsDraft.ts";
import { AgentProfileSettingsForm } from "./AgentProfileSettingsForm.tsx";
import type { AgentSettingsRoute } from "./settingsTypes.ts";

type ProfileRoute = Extract<AgentSettingsRoute, { page: "profiles" }>;

type ProfileDraftSession =
  | { status: "closed" }
  | { draft: AgentProfileDraft; status: "creating" }
  | { draft: AgentProfileDraft; profileId: string; status: "editing" };

export function AgentProfileSettingsSection({
  agent,
  busy,
  onRouteChange,
  route,
}: {
  agent: AgentApplication;
  busy: boolean;
  onRouteChange(route: ProfileRoute): void;
  route: ProfileRoute;
}) {
  const feedback = useFeedback();
  const [draftSession, setDraftSession] = useState<ProfileDraftSession>({
    status: "closed",
  });
  const configuration = agent.configurationState.configuration;
  const profiles = configuration?.profiles ?? [];
  const providers = configuration?.providers ?? [];
  const modelOptions = useMemo(() => [...new Set([
    ...(agent.configurationState.discovery?.models ?? []),
    ...Object.values(agent.configurationState.probes).flatMap(
      ({ models }) => models,
    ),
  ])].sort(), [
    agent.configurationState.discovery,
    agent.configurationState.probes,
  ]);
  const selectedProvider = draftSession.status === "closed"
    ? null
    : providers.find(({ id }) => id === draftSession.draft.providerId) ?? null;

  const submitProfile = (event: FormEvent) => {
    event.preventDefault();
    if (draftSession.status === "closed" || !selectedProvider) return;
    const input = agentProfileInput(draftSession.draft, selectedProvider.kind);

    void feedback.runAction(async () => {
      if (draftSession.status === "editing") {
        await agent.configurationController.updateProfile(
          draftSession.profileId,
          input,
        );
        onRouteChange({
          page: "profiles",
          selectedProfileId: draftSession.profileId,
        });
      } else {
        const previousIds = new Set(profiles.map(({ id }) => id));
        await agent.configurationController.createProfile(input);
        const created = agent.configurationController.getSnapshot().configuration
          ?.profiles.find(({ id }) => !previousIds.has(id));

        if (created) {
          onRouteChange({
            page: "profiles",
            selectedProfileId: created.id,
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
          ? "编辑 Profile"
          : "新建 Profile"}
      >
        <AgentProfileSettingsForm
          busy={busy}
          draft={draftSession.draft}
          editing={draftSession.status === "editing"}
          modelOptions={modelOptions}
          onCancel={() => setDraftSession({ status: "closed" })}
          onChange={(draft) => setDraftSession({ ...draftSession, draft })}
          onSubmit={submitProfile}
          providers={providers}
          selectedProvider={selectedProvider}
        />
      </ToolSection>
    );
  }

  return (
    <ToolSection
      actions={(
        <Button
          onClick={() => setDraftSession({
            draft: createAgentProfileDraft(),
            status: "creating",
          })}
          type="button"
          variant="primary"
        >
          新建 Profile
        </Button>
      )}
      title="Profile"
    >
      {profiles.length === 0 ? (
        <EmptyState compact title="尚未创建 Profile" />
      ) : (
        <ManagementList aria-label="Profile 列表">
          {profiles.map((profile, index) => {
            const check = agent.configurationState.conformanceChecks[profile.id];
            const running = check?.status === "running";

            return (
              <ManagementRow
                actions={(
                  <>
                    {profile.parameters.kind === "chat"
                      ? running ? (
                          <Button
                            disabled={check.phase === "recording-result"}
                            onClick={() => void feedback.runAction(() =>
                              agent.configurationController.cancelConformance(
                                profile.id,
                              )
                            )}
                            type="button"
                          >
                            {check.phase === "recording-result"
                              ? "正在记录"
                              : "取消检查"}
                          </Button>
                        ) : (
                          <Button
                            disabled={busy}
                            onClick={() => void feedback.runAction(() =>
                              agent.configurationController.checkConformance(
                                profile.id,
                              )
                            )}
                            type="button"
                          >
                            符合性检查
                          </Button>
                        )
                      : null}
                    <Button
                      disabled={busy}
                      onClick={() => {
                        onRouteChange({ page: "profiles", selectedProfileId: profile.id });
                        setDraftSession({
                          draft: agentProfileDraftFrom(profile),
                        profileId: profile.id,
                          status: "editing",
                        });
                      }}
                      type="button"
                    >
                      编辑
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() => void feedback.runAction(async () => {
                        await agent.configurationController.deleteProfile(
                          profile.id,
                        );
                        const remaining = agent.configurationController
                          .getSnapshot().configuration?.profiles ?? [];
                        const next = remaining[
                          Math.min(index, Math.max(0, remaining.length - 1))
                        ];

                        onRouteChange({
                          page: "profiles",
                          selectedProfileId: next?.id ?? null,
                        });
                      })}
                      type="button"
                      variant="danger"
                    >
                      删除
                    </Button>
                  </>
                )}
                key={profile.id}
                onSelect={() => onRouteChange({
                  page: "profiles",
                  selectedProfileId: profile.id,
                })}
                selected={route.selectedProfileId === profile.id}
                status={(
                  <StatusBadge
                    tone={profile.availability === "available"
                      ? "success"
                      : "warning"}
                  >
                    {profile.availability === "available" ? "可用" : "不可用"}
                  </StatusBadge>
                )}
                title={profile.label}
              />
            );
          })}
        </ManagementList>
      )}
    </ToolSection>
  );
}
