// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentApplication } from "../../../application/agent/index.ts";
import {
  InputControl,
  SelectControl,
  FieldRow,
  FormActions,
  FormLayout,
  Button,
  useFeedback,
  ToolSection,
  ToolSectionStack,
} from "../../ui/index.ts";




import type { AgentSettingsRoute } from "./settingsTypes.ts";

type ManagementPage = Exclude<AgentSettingsRoute["page"], "overview">;

export function AgentSettingsOverview({
  agent,
  busy,
  ollamaEndpoint,
  onEndpointChange,
  onNavigate,
}: {
  agent: AgentApplication;
  busy: boolean;
  ollamaEndpoint: string;
  onEndpointChange(value: string): void;
  onNavigate(page: ManagementPage): void;
}) {
  const feedback = useFeedback();
  const statusProfiles = agent.state.status?.profiles ?? [];

  return (
    <ToolSectionStack>
      <ToolSection title="默认 Profile">
        <FormLayout>
          <FieldRow fieldId="settings-agent-default-profile" label="默认 Profile">
            {(accessibility) => (
              <SelectControl
                {...accessibility}
                aria-label="默认 Profile"
                disabled={agent.state.loadStatus === "loading"}
                onChange={(event) => agent.controller.setPreferredProfile(
                  event.currentTarget.value || null,
                )}
                value={agent.state.preferredProfileId ?? ""}
              >
                <option value="">未选择</option>
                {statusProfiles.map((profile) => (
                  <option
                    disabled={profile.availability !== "available"}
                    key={profile.id}
                    value={profile.id}
                  >
                    {profile.label}
                    {profile.availability === "unavailable" ? "（不可用）" : ""}
                  </option>
                ))}
              </SelectControl>
            )}
          </FieldRow>
        </FormLayout>
      </ToolSection>
      <ToolSection title="发现本地 Ollama">
        <FormLayout>
          <FieldRow fieldId="settings-agent-ollama-endpoint" label="Ollama 地址">
            {(accessibility) => (
              <InputControl
                {...accessibility}
                aria-label="Ollama 地址"
                onChange={(event) => onEndpointChange(event.currentTarget.value)}
                value={ollamaEndpoint}
              />
            )}
          </FieldRow>
          <FormActions>
            <Button
              disabled={busy}
              onClick={() => void feedback.runAction(() =>
                agent.configurationController.discoverOllama(ollamaEndpoint)
              )}
              type="button"
            >
              发现本地 Ollama
            </Button>
          </FormActions>
        </FormLayout>
      </ToolSection>
      <ToolSection aria-label="智能体管理入口">
        <div className="settings-agent-overview-links">
          <Button onClick={() => onNavigate("providers")} type="button">
            管理 Provider
          </Button>
          <Button onClick={() => onNavigate("profiles")} type="button">
            管理 Profile
          </Button>
        </div>
      </ToolSection>
    </ToolSectionStack>
  );
}
