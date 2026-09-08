// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentApplication } from "../../../application/agent/index.ts";
import type { LocalContentAccess } from "../../../application/operations/index.ts";
import type {
SystemApplication,
SystemReconnectPort,
} from "../../../application/system/index.ts";
import { AgentProfileSettingsPanel } from "./AgentProfileSettingsPanel.tsx";
import { AgentProviderSettingsPanel } from "./AgentProviderSettingsPanel.tsx";
import { AgentSettingsOverview } from "./AgentSettingsOverview.tsx";
import {
InterfaceSettingsPanel,
type SettingsWorkbenchPreferences,
} from "./InterfaceSettingsPanel.tsx";
import { LocalApiSettingsPanel } from "./LocalApiSettingsPanel.tsx";
import { MigrationSettingsPanel } from "./MigrationSettingsPanel.tsx";
import { OperationsSettingsPanel } from "./OperationsSettingsPanel.tsx";
import { OwnerCredentialSettingsPanel } from "./OwnerCredentialSettingsPanel.tsx";
import type { SettingsTarget } from "./settingsTypes.ts";
import { SystemConfigurationPanel } from "./SystemConfigurationPanel.tsx";
import type { OperationsSettingsPanelView } from "./useOperationsSettingsSession.ts";
import type { SettingsInteractionReporter } from "./useSettingsInteraction.ts";
import type { SystemOwnerCredentialPanelView } from "./useSystemOwnerCredentialSession.ts";

export type SettingsPanelProps = {
  agent: AgentApplication;
  localApi: LocalContentAccess;
  navigation: SystemReconnectPort;
  onCompleted(target: SettingsTarget): void;
  operations: OperationsSettingsPanelView;
  owner: SystemOwnerCredentialPanelView;
  report: SettingsInteractionReporter;
  system: SystemApplication;
  target: SettingsTarget;
  workbench: SettingsWorkbenchPreferences;
};

/** Composition boundary: pages receive only their own state and commands. */
export function SettingsPanel({
  agent,
  localApi,
  navigation,
  onCompleted,
  operations,
  owner,
  report,
  system,
  target,
  workbench,
}: SettingsPanelProps) {
  switch (target.kind) {
    case "interface":
      return <InterfaceSettingsPanel workbench={workbench} />;
    case "network":
    case "paths":
    case "audit-retention":
      return (
        <SystemConfigurationPanel
          controller={system.configurationController}
          navigation={navigation}
          page={target.kind}
          report={report}
          state={system.configurationState}
        />
      );
    case "owner":
      return (
        <OwnerCredentialSettingsPanel
          authentication={system.authenticationController}
          navigation={navigation}
          report={report}
          session={owner}
          state={system.configurationState}
        />
      );
    case "migration":
      return (
        <MigrationSettingsPanel
          controller={system.configurationController}
          navigation={navigation}
          report={report}
          state={system.configurationState}
        />
      );
    case "provider":
      return (
        <AgentProviderSettingsPanel
          commands={agent.configurationController}
          id={target.id}
          onCompleted={onCompleted}
          report={report}
          state={agent.configurationState}
        />
      );
    case "profile":
      return (
        <AgentProfileSettingsPanel
          commands={agent.configurationController}
          id={target.id}
          onCompleted={onCompleted}
          report={report}
          state={agent.configurationState}
        />
      );
    case "agent-default":
    case "agent-discovery":
      return (
        <AgentSettingsOverview
          configurationState={agent.configurationState}
          discover={agent.configurationController.discoverOllama}
          page={target.kind}
          preferredProfileId={agent.state.preferredProfileId}
          report={report}
          setPreferredProfile={agent.controller.setPreferredProfile}
          status={agent.state.status}
        />
      );
    case "local-api":
      return <LocalApiSettingsPanel api={localApi} report={report} />;
    case "audit":
      return <OperationsSettingsPanel report={report} session={operations} />;
  }
}
