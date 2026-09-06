// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "react";
import type { AgentApplication } from "../../../application/agent/index.ts";
import {
  Button,
  SubsectionTabs,
  useFeedback,
  ToolPanel,
  ToolPanelBody,
} from "../../ui/index.ts";



import { AgentProfileSettingsSection } from "./AgentProfileSettingsSection.tsx";
import { AgentProviderSettingsSection } from "./AgentProviderSettingsSection.tsx";
import { AgentSettingsOverview } from "./AgentSettingsOverview.tsx";
import type { AgentSettingsRoute } from "./settingsTypes.ts";

const agentSettingsTabs = [
  { label: "概览", value: "overview" },
  { label: "Provider", value: "providers" },
  { label: "Profile", value: "profiles" },
] as const;

export function AgentSettingsPanel({
  agent,
  onRouteChange,
  route,
}: {
  agent: AgentApplication;
  onRouteChange(route: AgentSettingsRoute): void;
  route: AgentSettingsRoute;
}) {
  const feedback = useFeedback();
  const { configurationController, configurationState, controller, state } =
    agent;
  const [ollamaEndpoint, setOllamaEndpoint] = useState(
    "http://127.0.0.1:11434",
  );
  const busy = configurationState.operationStatus === "working";
  const changePage = (page: AgentSettingsRoute["page"]) => {
    onRouteChange(page === "overview"
      ? { page: "overview" }
      : page === "providers"
        ? { page: "providers", selectedProviderId: null }
        : { page: "profiles", selectedProfileId: null });
  };
  const refresh = () => void feedback.runAction(async () => {
    await configurationController.load();
    await controller.refreshStatus();
  });

  return (
    <ToolPanel
      actions={(
        <Button
          disabled={busy || state.operationStatus === "working"}
          onClick={refresh}
          type="button"
        >
          刷新状态
        </Button>
      )}
      aria-label="智能体设置"
      className="settings-panel"
      title="智能体"
    >
      <ToolPanelBody layout="form">
        {configurationState.errorMessage || state.errorMessage ? (
          <p className="settings-api-error" role="alert">
            {configurationState.errorMessage ?? state.errorMessage}
          </p>
        ) : null}
        {state.status?.configurationProblem ? (
          <p className="settings-api-error" role="alert">
            {state.status.configurationProblem}
          </p>
        ) : null}
        <SubsectionTabs
          ariaLabel="智能体设置页面"
          onChange={changePage}
          options={agentSettingsTabs}
          value={route.page}
        >
          {route.page === "overview" ? (
            <AgentSettingsOverview
              agent={agent}
              busy={busy}
              ollamaEndpoint={ollamaEndpoint}
              onEndpointChange={setOllamaEndpoint}
              onNavigate={changePage}
            />
          ) : route.page === "providers" ? (
            <AgentProviderSettingsSection
              agent={agent}
              busy={busy}
              onRouteChange={onRouteChange}
              route={route}
            />
          ) : (
            <AgentProfileSettingsSection
              agent={agent}
              busy={busy}
              onRouteChange={onRouteChange}
              route={route}
            />
          )}
        </SubsectionTabs>
      </ToolPanelBody>
    </ToolPanel>
  );
}
