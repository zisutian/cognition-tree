// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "react";
import type {
  AgentApplication,
  AgentConfigurationController,
  AgentConfigurationState,
} from "../../../application/agent/index.ts";
import {
  Button,
  FieldRow,
  FormLayout,
  InputControl,
  SelectControl,
  ToolPropertyList,
  ToolPropertyRow,
  useFeedback,
} from "../../ui/index.ts";
import { SettingsPage } from "./SettingsPage.tsx";
import {
  useSettingsInteraction,
  type SettingsInteractionReporter,
} from "./useSettingsInteraction.ts";

export function AgentSettingsOverview({
  configurationState,
  discover,
  page,
  preferredProfileId,
  report,
  setPreferredProfile,
  status,
}: {
  configurationState: AgentConfigurationState;
  discover: AgentConfigurationController["discoverOllama"];
  page: "agent-default" | "agent-discovery";
  preferredProfileId: string | null;
  report: SettingsInteractionReporter;
  setPreferredProfile: AgentApplication["controller"]["setPreferredProfile"];
  status: AgentApplication["state"]["status"];
}) {
  const feedback = useFeedback();
  const [endpoint, setEndpoint] = useState("http://127.0.0.1:11434");
  const busy = configurationState.operationStatus === "working";
  useSettingsInteraction(report, {
    errorMessage: configurationState.errorMessage,
  });
  return (
    <SettingsPage
      title={page === "agent-default" ? "默认会话配置" : "本地服务发现"}
      errorMessage={configurationState.errorMessage}
    >
      {page === "agent-default" ? (
        <FormLayout>
          <FieldRow
            fieldId="settings-agent-default-profile"
            label="默认 Profile"
          >
            {(accessibility) => (
              <SelectControl
                {...accessibility}
                aria-label="默认 Profile"
                value={preferredProfileId ?? ""}
                onChange={(event) =>
                  setPreferredProfile(event.currentTarget.value || null)
                }
              >
                <option value="">未选择</option>
                {(status?.profiles ?? []).map((profile) => (
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
      ) : (
        <>
          <FormLayout>
            <FieldRow
              fieldId="settings-agent-ollama-endpoint"
              label="Ollama 地址"
            >
              {(accessibility) => (
                <InputControl
                  {...accessibility}
                  aria-label="Ollama 地址"
                  onChange={(event) => setEndpoint(event.currentTarget.value)}
                  value={endpoint}
                />
              )}
            </FieldRow>
          </FormLayout>
          <div className="ui-actions">
            <Button
              disabled={busy}
              onClick={() => void feedback.runAction(() => discover(endpoint))}
              type="button"
            >
              发现本地 Ollama
            </Button>
          </div>
          {configurationState.discovery ? (
            <ToolPropertyList aria-label="发现结果">
              <ToolPropertyRow
                label="模型"
                value={
                  configurationState.discovery.models.join("、") || "未发现模型"
                }
              />
            </ToolPropertyList>
          ) : null}
        </>
      )}
    </SettingsPage>
  );
}
